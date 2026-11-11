// components/SearchIndicator.tsx
// Animated indicator shown while the agent is calling web_search

export function SearchIndicator({ query }: { query?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-indigo-400 animate-pulse py-1">
      <svg
        className="w-4 h-4 shrink-0 animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <span>
        Searching{query ? <>: <em className="font-mono text-xs">{query}</em></> : "…"}
      </span>
    </div>
  );
}
