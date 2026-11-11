"use client";

import { useRef, useEffect, useState } from "react";
import { MessageBubble } from "@/components/MessageBubble";
import { SearchIndicator } from "@/components/SearchIndicator";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const EXAMPLE_QUERIES = [
  "On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?",
  "What did I ask you on 3 November? Is your answer still correct today?",
  "Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?",
  "What are the latest AI coding tools released this week?",
];

function generateSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function Home() {
  const [conversationId] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("nexus-session-id");
      if (stored) return stored;
      const newId = generateSessionId();
      sessionStorage.setItem("nexus-session-id", newId);
      return newId;
    }
    return generateSessionId();
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSearching]);

  const sendMessage = async (userPrompt: string) => {
    const trimmed = userPrompt.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setIsLoading(true);
    setIsSearching(false);
    setSearchQuery(undefined);

    const assistantId = `asst-${Date.now()}`;
    // Add placeholder assistant message
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          conversationId,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith("data:")) continue;
          const jsonStr = trimmedLine.replace(/^data:\s*/, "");
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);
            if (data.type === "tool-call") {
              setIsSearching(true);
              setSearchQuery(data.query || undefined);
            } else if (data.type === "text-delta") {
              setIsSearching(false);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + data.text }
                    : m
                )
              );
            } else if (data.type === "done") {
              setIsSearching(false);
              setSearchQuery(undefined);
            } else if (data.type === "error") {
              setIsSearching(false);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content:
                          m.content ||
                          `An error occurred: ${data.error || "Unable to complete request"}`,
                      }
                    : m
                )
              );
            }
          } catch {
            // Ignore malformed line
          }
        }
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  m.content ||
                  `Sorry, I encountered an error: ${err.message || "Network error"}. Please check your API keys in .env.local.`,
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
      setIsSearching(false);
      setSearchQuery(undefined);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleExampleClick = (query: string) => {
    sendMessage(query);
  };

  const isStreamingLast =
    isLoading && messages[messages.length - 1]?.role === "assistant";

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="shrink-0 border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center font-bold text-sm text-white">
          N
        </div>
        <div>
          <h1 className="text-sm font-semibold text-white">Nexus</h1>
          <p className="text-xs text-zinc-400">
            AI assistant with real-time web search
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-zinc-400">Live search enabled</span>
        </div>
      </header>

      {/* Messages area */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-6">
              <div>
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-2xl font-bold mx-auto mb-4 text-white">
                  N
                </div>
                <h2 className="text-xl font-semibold text-white mb-1">
                  Hi, I&apos;m Nexus
                </h2>
                <p className="text-zinc-400 text-sm max-w-sm">
                  I can search the web in real-time and remember our past
                  conversations. Ask me anything.
                </p>
              </div>

              <div className="w-full max-w-lg space-y-2">
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
                  Try asking
                </p>
                {EXAMPLE_QUERIES.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleExampleClick(q)}
                    className="w-full text-left text-sm px-4 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-indigo-500 text-zinc-300 hover:text-white transition-all cursor-pointer"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message, i) => (
            <MessageBubble
              key={message.id}
              role={message.role}
              content={message.content}
              isStreaming={isStreamingLast && i === messages.length - 1}
            />
          ))}

          {/* Search indicator — shown while tool is running */}
          {isLoading && !isStreamingLast && (
            <div className="flex justify-start">
              <div className="ml-9 bg-zinc-900 border border-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3">
                {isSearching ? (
                  <SearchIndicator query={searchQuery} />
                ) : (
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:300ms]" />
                    </div>
                    <span>Thinking…</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input area */}
      <footer className="shrink-0 border-t border-zinc-800 px-4 py-4 bg-zinc-950">
        <div className="max-w-3xl mx-auto">
          <div className="relative flex items-end gap-2 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 focus-within:border-indigo-500 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything… I'll search the web when needed"
              rows={1}
              className="flex-1 bg-transparent resize-none outline-none text-sm text-zinc-100 placeholder-zinc-500 leading-relaxed max-h-48"
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              className="shrink-0 w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer"
            >
              {isLoading ? (
                <svg
                  className="w-4 h-4 animate-spin text-zinc-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-center text-xs text-zinc-500 mt-2">
            Press <kbd className="px-1 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">Enter</kbd> to send ·{" "}
            <kbd className="px-1 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">Shift+Enter</kbd> for newline
          </p>
        </div>
      </footer>
    </div>
  );
}
