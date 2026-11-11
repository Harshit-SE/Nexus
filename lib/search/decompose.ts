// lib/search/decompose.ts
// Decomposes multi-entity queries into atomic sub-queries for parallel search

import { generateText } from "ai";
import { google } from "@ai-sdk/google";

/**
 * Given a user message mentioning multiple products/entities and a topic,
 * returns an array of atomic search queries — one per entity.
 *
 * Example:
 *   entities: ["HubSpot", "Salesforce", "Pipedrive"]
 *   topic: "pricing changes 2025"
 *   → ["HubSpot CRM pricing changes 2025", "Salesforce pricing changes 2025", ...]
 */
export async function decomposeToQueries(
  entities: string[],
  topic: string
): Promise<string[]> {
  if (entities.length === 0) return [];
  if (entities.length === 1) return [`${entities[0]} ${topic}`];

  // For small lists, just template it directly — no LLM needed
  if (entities.length <= 6) {
    return entities.map((e) => `${e} ${topic}`);
  }

  // For larger or more complex cases, use LLM decomposition
  const { text } = await generateText({
    model: google("gemini-flash-latest"),
    prompt: `Generate one focused web search query per entity below, targeting: "${topic}".
Return ONLY a JSON array of strings, nothing else.

Entities: ${entities.join(", ")}

Example output format: ["Entity A pricing 2025", "Entity B pricing 2025"]`,
  });

  try {
    const cleaned = text.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
    const queries = JSON.parse(cleaned);
    if (Array.isArray(queries)) return queries as string[];
  } catch {
    // fallback
  }
  return entities.map((e) => `${e} ${topic}`);
}
