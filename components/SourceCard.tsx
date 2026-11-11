// components/SourceCard.tsx
// Displays a cited source URL as a compact card below an assistant message

interface SourceCardProps {
  title: string;
  url: string;
  index: number;
}

export function SourceCard({ title, url, index }: SourceCardProps) {
  let hostname = "";
  try {
    hostname = new URL(url).hostname.replace("www.", "");
  } catch {
    hostname = url;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-indigo-500 transition-all text-xs text-zinc-300 hover:text-white group"
    >
      <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold">
        {index}
      </span>
      <img
        src={`https://www.google.com/s2/favicons?sz=16&domain=${hostname}`}
        alt=""
        className="w-4 h-4 shrink-0 rounded-sm"
        onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
      />
      <div className="flex flex-col min-w-0">
        <span className="truncate font-medium">{title || hostname}</span>
        <span className="text-zinc-500 truncate">{hostname}</span>
      </div>
      <svg
        className="w-3 h-3 shrink-0 ml-auto text-zinc-500 group-hover:text-indigo-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15,3 21,3 21,9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </a>
  );
}
