// lib/agent/tools.ts
// Tool definitions for the ReAct agent.
// Supports both single-query search and parallel multi-query search.

import { tool } from "ai";
import { z } from "zod";
import {
  braveSearch,
  parallelSearch,
  formatResults,
  type Freshness,
} from "@/lib/search/brave";

/**
 * web_search — the agent's window to the live internet.
 * Supports:
 * - Single query (`query: "..."`)
 * - Multi-query parallel execution (`queries: ["...", "..."]`) for comparing multiple tools/topics
 */
export const webSearchTool = tool({
  description: `Search the web for current, up-to-date information.

USE THIS TOOL when the user asks about:
- Current prices, plans, or pricing changes for any product or service
- Recent news, announcements, or product updates
- Whether something has changed since a specific date
- Any fact that may have changed recently (stock prices, availability, etc.)

For multi-entity queries (e.g. "check these 5 CRM tools" or "compare pricing for Neon vs Supabase"):
- Provide an array of specific queries via 'queries' to search all of them in parallel!

FRESHNESS parameter guide:
- "pd" = past day (use for "today", "this morning", breaking news)
- "pw" = past week (use for "this week", "has X changed recently", "since Monday")
- "pm" = past month (use for "this month", longer-term changes)
- omit for general/timeless queries`,

  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe(
        "Single search query. Good: 'HubSpot CRM pricing plans 2025'."
      ),
    queries: z
      .array(z.string())
      .optional()
      .describe(
        "Multiple search queries to run in parallel. Use this when checking multiple tools or competitors (e.g. ['HubSpot CRM pricing changes', 'Salesforce pricing changes'])."
      ),
    freshness: z
      .enum(["pd", "pw", "pm"])
      .optional()
      .describe(
        "Filter to recent results only. Use 'pw' for 'has X changed since Monday/this week' queries."
      ),
  }),

  execute: async ({
    query,
    queries,
    freshness,
  }: {
    query?: string;
    queries?: string[];
    freshness?: "pd" | "pw" | "pm";
  }) => {
    try {
      // 1. Multi-query parallel search
      if (queries && queries.length > 0) {
        const resultMap = await parallelSearch(queries, {
          freshness: freshness as Freshness | undefined,
          count: 3,
        });

        const outputParts: string[] = [];
        for (const [q, results] of resultMap.entries()) {
          outputParts.push(
            `### Search for: "${q}"\n` + formatResults(results, q)
          );
        }
        return outputParts.join("\n\n---\n\n");
      }

      // 2. Single query search
      const singleQuery = query || "";
      if (!singleQuery.trim()) {
        return "Error: Please provide a search query.";
      }

      const results = await braveSearch(singleQuery, {
        freshness: freshness as Freshness | undefined,
        count: 6,
      });

      if (results.length === 0) {
        return `No search results found for "${singleQuery}". The query may be too specific. Try a broader query.`;
      }

      return formatResults(results, singleQuery);
    } catch (error: any) {
      if (error?.message === "BRAVE_RATE_LIMITED") {
        return `Web search is temporarily rate-limited. I'll answer from my training knowledge but note it may not reflect the very latest changes. Please try again in a moment for a fresh answer.`;
      }
      return `Search failed: ${error?.message ?? "Unknown error"}. Please try rephrasing the query.`;
    }
  },
});

export const tools = { web_search: webSearchTool };
