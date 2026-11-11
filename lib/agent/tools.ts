// lib/agent/tools.ts
// Tool definitions for the ReAct agent.
// All tools are defined using Vercel AI SDK's tool() helper with Zod schemas.

import { tool } from "ai";
import { z } from "zod";
import { braveSearch, formatResults, type Freshness } from "@/lib/search/brave";

/**
 * web_search — the agent's window to the live internet.
 *
 * The description is carefully crafted to teach the LLM:
 * - WHEN to use it (freshness-sensitive questions)
 * - WHEN NOT to use it (general knowledge, math, conversation recall)
 * - HOW to use the freshness parameter
 */
export const webSearchTool = tool({
  description: `Search the web for current, up-to-date information.

USE THIS TOOL when the user asks about:
- Current prices, plans, or pricing changes for any product or service
- Recent news, announcements, or product updates
- Whether something has changed since a specific date
- Any fact that may have changed recently (stock prices, availability, etc.)

DO NOT use this tool for:
- General knowledge questions your training data covers well
- Mathematical calculations
- Questions about our conversation history (use the memory context instead)
- Creative writing or brainstorming

FRESHNESS parameter guide:
- "pd" = past day (use for "today", "this morning", breaking news)
- "pw" = past week (use for "this week", "has X changed recently", "since Monday")
- "pm" = past month (use for "this month", longer-term changes)
- omit for general/timeless queries`,

  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "The search query. Be specific — include the product name, version, year. Good: 'HubSpot CRM pricing plans November 2025'. Bad: 'hubspot price'."
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
    freshness,
  }: {
    query: string;
    freshness?: "pd" | "pw" | "pm";
  }) => {
    try {
      const results = await braveSearch(query, {
        freshness: freshness as Freshness | undefined,
        count: 6,
      });

      if (results.length === 0) {
        return `No search results found for "${query}". The page may not be indexed or the query may be too specific. Try a broader query.`;
      }

      return formatResults(results, query);
    } catch (error: any) {
      if (error?.message === "BRAVE_RATE_LIMITED") {
        return `Web search is temporarily rate-limited. I'll answer from my training knowledge but note it may not reflect the very latest changes. Please try again in a moment for a fresh answer.`;
      }
      return `Search failed: ${error?.message ?? "Unknown error"}. Please try rephrasing the query.`;
    }
  },
});

export const tools = { web_search: webSearchTool };
