// lib/utils/dates.ts
// Natural language date parsing using chrono-node

import * as chrono from "chrono-node";

/**
 * Parse a natural language date expression to a Date object.
 * Returns null if parsing fails.
 *
 * Examples:
 *   "last Tuesday"   → Date(last Tuesday)
 *   "3 November"     → Date(Nov 3 this year)
 *   "on Monday"      → Date(last or this Monday)
 */
export function parseNaturalDate(text: string, refDate?: Date): Date | null {
  const ref = refDate ?? new Date();
  const results = chrono.parse(text, ref, { forwardDate: false });
  if (results.length === 0) return null;
  return results[0].date();
}

/**
 * Check if two dates fall on the same calendar day.
 */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Format a date as a human-readable string.
 */
export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Returns the current date/time formatted for injection into the system prompt.
 */
export function currentDateTimeString(): string {
  const now = new Date();
  return now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
