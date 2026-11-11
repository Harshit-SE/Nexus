// components/MessageBubble.tsx
// Renders a single chat message with markdown, source cards, and copy button

"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { SourceCard } from "./SourceCard";

interface Source {
  title: string;
  url: string;
}

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  isStreaming?: boolean;
}

function extractSources(content: string): Source[] {
  const urlPattern = /\bhttps?:\/\/[^\s\)\]"']+/g;
  const matches = content.match(urlPattern) ?? [];
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const url of matches) {
    const clean = url.replace(/[.,;:!?]$/, "");
    if (!seen.has(clean)) {
      seen.add(clean);
      try {
        const hostname = new URL(clean).hostname.replace("www.", "");
        sources.push({ title: hostname, url: clean });
      } catch {
        /* skip invalid URLs */
      }
    }
  }
  return sources.slice(0, 6);
}

export function MessageBubble({
  role,
  content,
  isStreaming = false,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = role === "user";
  const sources = !isUser ? extractSources(content) : [];

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} group`}>
      <div className={`max-w-[85%] ${isUser ? "order-2" : "order-1"}`}>
        {/* Avatar */}
        <div className={`flex items-end gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mb-1 ${
              isUser
                ? "bg-indigo-600 text-white"
                : "bg-gradient-to-br from-purple-600 to-indigo-600 text-white"
            }`}
          >
            {isUser ? "U" : "N"}
          </div>

          {/* Bubble */}
          <div
            className={`relative rounded-2xl px-4 py-3 ${
              isUser
                ? "bg-indigo-600 text-white rounded-br-sm"
                : "bg-zinc-800 text-zinc-100 rounded-bl-sm border border-zinc-700"
            }`}
          >
            {isUser ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
            ) : (
              <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-p:my-1 prose-headings:text-zinc-100 prose-a:text-indigo-400 prose-code:text-indigo-300 prose-code:bg-zinc-900 prose-code:px-1 prose-code:rounded prose-pre:bg-zinc-900 prose-ul:my-1 prose-li:my-0.5">
                <ReactMarkdown>{content}</ReactMarkdown>
                {isStreaming && (
                  <span className="inline-block w-1 h-4 bg-indigo-400 animate-pulse ml-0.5 align-middle" />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Source cards */}
        {sources.length > 0 && !isStreaming && (
          <div className="mt-2 ml-9 grid grid-cols-2 gap-1.5">
            {sources.map((s, i) => (
              <SourceCard key={s.url} title={s.title} url={s.url} index={i + 1} />
            ))}
          </div>
        )}

        {/* Copy button */}
        {!isUser && !isStreaming && (
          <button
            onClick={handleCopy}
            className="ml-9 mt-1 text-xs text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
          >
            {copied ? (
              <>
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
