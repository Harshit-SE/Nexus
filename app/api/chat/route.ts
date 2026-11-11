// app/api/chat/route.ts
// Dual-engine ReAct agent: Local Ollama (Phi-3) + Cloud Gemini (gemini-flash-latest)

import { streamText, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { tools, webSearchTool } from "@/lib/agent/tools";
import { braveSearch, formatResults } from "@/lib/search/brave";
import { buildSystemPrompt } from "@/lib/agent/system-prompt";
import { classifyTemporalIntent } from "@/lib/agent/temporal";
import {
  saveTurn,
  getRecentTurns,
  retrieveRelevantMemory,
} from "@/lib/memory/store";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { messages, conversationId = "default" } = await req.json();

    const latestUserMessage: string =
      messages[messages.length - 1]?.content ?? "";

    // ── 1. Temporal Intent Classification (< 1ms) ──────────────────────────
    const temporalIntent = classifyTemporalIntent(latestUserMessage);

    // ── 2. Memory Retrieval (Short-term + Long-term cross-session) ──────────
    const recentTurns = getRecentTurns(conversationId, 10);
    let relevantMemory = recentTurns;

    if (temporalIntent.needsHistory) {
      try {
        const dateFilter = temporalIntent.referenceDate ?? undefined;
        const matches = await retrieveRelevantMemory(
          conversationId,
          latestUserMessage,
          { dateFilter, topK: 5 }
        );
        const seen = new Set(recentTurns.map((e) => e.id));
        const extra = matches.filter((e) => !seen.has(e.id));
        relevantMemory = [...extra, ...recentTurns];
      } catch {
        // Fallback to recent turns
      }
    }

    // ── 3. Build Base System Prompt ─────────────────────────────────────────
    let systemPrompt = buildSystemPrompt(relevantMemory, conversationId);

    // ── 4. Save User Turn ───────────────────────────────────────────────────
    saveTurn(conversationId, "user", latestUserMessage).catch(() => {});

    // ── 5. Setup SSE Stream Response ────────────────────────────────────────
    const encoder = new TextEncoder();
    const useOllama = process.env.LLM_PROVIDER === "ollama";
    const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
    const ollamaModel = process.env.OLLAMA_MODEL || "phi3";

    let fullResponseText = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // A. If search is needed, run search pre-flight and stream indicator
          if (temporalIntent.needsWebSearch) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "tool-call",
                  tool: "web_search",
                  query: latestUserMessage,
                })}\n\n`
              )
            );

            try {
              const results = await braveSearch(latestUserMessage, {
                freshness: "pw",
              });
              const searchContent = formatResults(results, latestUserMessage);

              systemPrompt += `\n\n## LIVE WEB SEARCH RESULTS (Retrieved Today):\n${searchContent}\n\nGround your answer in these results. Include source URLs.`;
            } catch {
              // Non-fatal
            }
          }

          // B. Attempt Local Ollama Stream if configured
          let ollamaSucceeded = false;
          if (useOllama) {
            try {
              const ollamaRes = await fetch(`${ollamaUrl}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: ollamaModel,
                  messages: [
                    { role: "system", content: systemPrompt },
                    ...messages.map((m: any) => ({
                      role: m.role,
                      content: m.content,
                    })),
                  ],
                  stream: true,
                }),
              });

              if (ollamaRes.ok && ollamaRes.body) {
                const reader = ollamaRes.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";

                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;

                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split("\n");
                  buffer = lines.pop() ?? "";

                  for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                      const parsed = JSON.parse(line);
                      const delta = parsed.message?.content || "";
                      if (delta) {
                        fullResponseText += delta;
                        controller.enqueue(
                          encoder.encode(
                            `data: ${JSON.stringify({
                              type: "text-delta",
                              text: delta,
                            })}\n\n`
                          )
                        );
                      }
                    } catch {}
                  }
                }
                ollamaSucceeded = true;
              }
            } catch {
              // Fall back to cloud provider if Ollama server fails
            }
          }

          // C. Cloud Gemini Fallback (if Ollama is disabled or unreachable)
          if (!ollamaSucceeded) {
            const result = streamText({
              model: google("gemini-flash-latest"),
              system: systemPrompt,
              messages,
              tools,
              stopWhen: stepCountIs(5),
              temperature: 0.3,
            });

            for await (const part of result.fullStream) {
              if (part.type === "tool-call") {
                const anyPart = part as any;
                const query =
                  anyPart.args?.query ||
                  anyPart.input?.query ||
                  (anyPart.args?.queries || anyPart.input?.queries || []).join(", ") ||
                  "";
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "tool-call",
                      tool: anyPart.toolName || "web_search",
                      query,
                    })}\n\n`
                  )
                );
              } else if (part.type === "text-delta") {
                const text = (part as any).text || "";
                fullResponseText += text;
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "text-delta", text })}\n\n`
                  )
                );
              }
            }
          }

          // Save assistant response
          if (fullResponseText) {
            saveTurn(conversationId, "assistant", fullResponseText).catch(() => {});
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
          );
        } catch (err: any) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: err?.message ?? "Execution error",
              })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
