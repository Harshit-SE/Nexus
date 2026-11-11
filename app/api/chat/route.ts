// app/api/chat/route.ts
// The ReAct agent endpoint — streaming, tool-calling, memory-aware.

import { streamText, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { tools } from "@/lib/agent/tools";
import { buildSystemPrompt } from "@/lib/agent/system-prompt";
import { classifyTemporalIntent } from "@/lib/agent/temporal";
import {
  saveTurn,
  getRecentTurns,
  retrieveRelevantMemory,
} from "@/lib/memory/store";

export const maxDuration = 60; // Allow up to 60s for multi-search queries

export async function POST(req: Request) {
  try {
    const { messages, conversationId = "default" } = await req.json();

    // ── 1. Get the latest user message ───────────────────────────────────────
    const latestUserMessage: string =
      messages[messages.length - 1]?.content ?? "";

    // ── 2. Classify temporal intent (regex, < 1ms) ────────────────────────────
    const temporalIntent = classifyTemporalIntent(latestUserMessage);

    // ── 3. Load relevant memory ───────────────────────────────────────────────
    // Short-term: always include last 10 turns verbatim
    const recentTurns = getRecentTurns(conversationId, 10);

    // Long-term: semantic + date-keyed retrieval when history is needed
    let relevantMemory = recentTurns;
    if (temporalIntent.needsHistory) {
      try {
        const dateFilter = temporalIntent.referenceDate ?? undefined;
        const semanticMatches = await retrieveRelevantMemory(
          conversationId,
          latestUserMessage,
          { dateFilter, topK: 5 }
        );
        // Merge & deduplicate by id
        const seen = new Set(recentTurns.map((e) => e.id));
        const extra = semanticMatches.filter((e) => !seen.has(e.id));
        relevantMemory = [...extra, ...recentTurns];
      } catch {
        // Non-fatal — continue with just recent turns
      }
    }

    // ── 4. Build system prompt with injected memory ───────────────────────────
    const systemPrompt = buildSystemPrompt(relevantMemory, conversationId);

    // ── 5. Save user turn to persistent memory ───────────────────────────────
    saveTurn(conversationId, "user", latestUserMessage).catch(() => {});

    // ── 6. Execute ReAct agent loop with streaming ───────────────────────────
    const result = streamText({
      model: google("gemini-2.0-flash"),
      system: systemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(5), // ReAct loop cap — prevents infinite tool calls
      temperature: 0.3, // Lower temp for factual, citation-grounded responses
    });

    // ── 7. Custom SSE Stream: sends text deltas, tool events, and completion ─
    const encoder = new TextEncoder();
    let fullResponseText = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
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

          // Save completed assistant turn
          if (fullResponseText) {
            saveTurn(conversationId, "assistant", fullResponseText).catch(
              () => {}
            );
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
          );
        } catch (err: any) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: err?.message ?? "Stream error",
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
      JSON.stringify({ error: err?.message ?? "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
