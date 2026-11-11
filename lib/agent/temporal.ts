// lib/agent/temporal.ts
// Temporal intent classifier — fast regex first, LLM fallback for ambiguous cases.
// Determines whether a message needs: web search, history retrieval, or both.

import { parseNaturalDate } from "@/lib/utils/dates";

export type TemporalIntent =
  | "FRESHNESS_CHECK"   // "has X changed?" / "is Y still correct?"
  | "HISTORY_LOOKUP"    // "what did I ask on Tuesday?"
  | "HISTORY_DELTA"     // "we talked about X on Monday — has anything changed?"
  | "NONE";             // No special temporal handling needed

export interface TemporalClassification {
  intent: TemporalIntent;
  needsWebSearch: boolean;
  needsHistory: boolean;
  referenceDate?: Date;
  extractedEntities?: string[];
}

// Regex patterns for fast classification (< 1ms, zero API cost)
const PATTERNS: Record<TemporalIntent, RegExp[]> = {
  FRESHNESS_CHECK: [
    /has\s+.+\s+changed/i,
    /is\s+.+\s+still\s+(correct|accurate|true|valid|right)/i,
    /any\s+(new\s+)?changes?\s+(since|to)/i,
    /still\s+the\s+same/i,
    /changed\s+since/i,
    /updates?\s+since/i,
    /anything\s+new\s+(on|about|with)/i,
    /latest\s+(pricing|price|news|update)/i,
  ],
  HISTORY_LOOKUP: [
    /what\s+did\s+i\s+(ask|say|mention|tell)/i,
    /what\s+were\s+we\s+(discussing|talking|chatting)/i,
    /what\s+was\s+i\s+(asking|saying)/i,
    /remind\s+me\s+(what|about)/i,
    /do\s+you\s+remember\s+(when|what|that)/i,
    /earlier\s+(i|we|you)\s+(asked|said|mentioned)/i,
  ],
  HISTORY_DELTA: [
    /(?:we|i)\s+(?:shortlisted|discussed|mentioned|talked\s+about|looked\s+at)\s+.+\s+(?:on|last)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d)/i,
    /(?:on|last)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:we|i)\s+/i,
    /since\s+(?:last\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)/i,
    /since\s+(?:then|our\s+last|that\s+conversation)/i,
  ],
  NONE: [],
};

/**
 * Classify the temporal intent of a user message.
 * Uses fast regex patterns. No API calls.
 */
export function classifyTemporalIntent(message: string): TemporalClassification {
  // Check HISTORY_DELTA first (most specific)
  for (const pattern of PATTERNS.HISTORY_DELTA) {
    if (pattern.test(message)) {
      return {
        intent: "HISTORY_DELTA",
        needsWebSearch: true,
        needsHistory: true,
        referenceDate: parseNaturalDate(message) ?? undefined,
        extractedEntities: extractProductNames(message),
      };
    }
  }

  // Check HISTORY_LOOKUP
  for (const pattern of PATTERNS.HISTORY_LOOKUP) {
    if (pattern.test(message)) {
      return {
        intent: "HISTORY_LOOKUP",
        needsWebSearch: false,
        needsHistory: true,
        referenceDate: parseNaturalDate(message) ?? undefined,
      };
    }
  }

  // Check FRESHNESS_CHECK
  for (const pattern of PATTERNS.FRESHNESS_CHECK) {
    if (pattern.test(message)) {
      return {
        intent: "FRESHNESS_CHECK",
        needsWebSearch: true,
        needsHistory: false,
        extractedEntities: extractProductNames(message),
      };
    }
  }

  return {
    intent: "NONE",
    needsWebSearch: false,
    needsHistory: false,
  };
}

/**
 * Heuristic entity extractor — finds product/company names (capitalized words).
 * Good enough for most cases; the LLM handles the rest in its own reasoning.
 */
function extractProductNames(message: string): string[] {
  // Match sequences of capitalized words (likely product/company names)
  const matches = message.match(/\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*/g) ?? [];

  // Filter out common English words that happen to be capitalized
  const stopWords = new Set([
    "I", "We", "On", "Has", "The", "Is", "What", "Did", "Any", "Last",
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
    "January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December",
  ]);

  return [...new Set(matches.filter((m) => !stopWords.has(m)))];
}
