// lib/search/brave.ts
// Brave Search API wrapper — JSON, freshness-aware, typed

export interface SearchResult {
  title: string;
  url: string;
  description: string;
  published?: string;
  age?: string;
}

export type Freshness = "pd" | "pw" | "pm"; // past day / week / month

export interface BraveSearchOptions {
  freshness?: Freshness;
  count?: number;
}

/**
 * Search the web via Brave Search API.
 * Returns clean structured results ready for LLM context injection.
 */
export async function braveSearch(
  query: string,
  options: BraveSearchOptions = {}
): Promise<SearchResult[]> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) throw new Error("BRAVE_API_KEY is not set");

  const params = new URLSearchParams({
    q: query,
    count: String(options.count ?? 6),
    text_decorations: "0",
    search_lang: "en",
  });
  if (options.freshness) params.set("freshness", options.freshness);

  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?${params}`,
    {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
    }
  );

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("BRAVE_RATE_LIMITED");
    }
    throw new Error(`Brave Search error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const results: SearchResult[] = (data.web?.results ?? []).map((r: any) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    description: r.description ?? "",
    published: r.page_age ?? r.age ?? undefined,
    age: r.age ?? undefined,
  }));

  return results;
}

/**
 * Run multiple queries in parallel and merge results.
 * Used for multi-entity queries ("5 CRM tools → 5 searches").
 */
export async function parallelSearch(
  queries: string[],
  options: BraveSearchOptions = {}
): Promise<Map<string, SearchResult[]>> {
  const results = await Promise.all(
    queries.map(async (q) => {
      try {
        const res = await braveSearch(q, { ...options, count: 4 });
        return { query: q, results: res };
      } catch {
        return { query: q, results: [] };
      }
    })
  );
  return new Map(results.map((r) => [r.query, r.results]));
}

/**
 * Format search results into a compact LLM-friendly string with citations.
 */
export function formatResults(results: SearchResult[], query?: string): string {
  if (results.length === 0) {
    return `No results found${query ? ` for "${query}"` : ""}.`;
  }
  return results
    .slice(0, 5)
    .map(
      (r, i) =>
        `[${i + 1}] **${r.title}**\nURL: ${r.url}${r.published ? `\nPublished: ${r.published}` : ""}\n${r.description}`
    )
    .join("\n\n");
}
