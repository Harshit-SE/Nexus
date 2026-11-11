// lib/memory/store.ts
// Persistent conversation memory:
// - JSON file per session (source of truth, human-readable)
// - In-memory vector index (rebuilt from JSON on startup)

import fs from "fs";
import path from "path";
import { embedText, cosineSimilarity } from "./embeddings";
import { isSameDay } from "@/lib/utils/dates";

export interface MemoryEntry {
  id: string;
  conversationId: string;
  timestamp: Date;
  role: "user" | "assistant";
  content: string;
  vector?: number[]; // populated lazily
}

// In-memory index keyed by conversationId
const memoryIndex: Map<string, MemoryEntry[]> = new Map();

function getDataDir(): string {
  return path.join(process.cwd(), "data", "conversations");
}

function getFilePath(conversationId: string): string {
  return path.join(getDataDir(), `${conversationId}.json`);
}

/**
 * Load a conversation from disk into the in-memory index.
 * No-op if already loaded.
 */
export function loadConversation(conversationId: string): MemoryEntry[] {
  if (memoryIndex.has(conversationId)) {
    return memoryIndex.get(conversationId)!;
  }

  const filePath = getFilePath(conversationId);
  if (!fs.existsSync(filePath)) {
    memoryIndex.set(conversationId, []);
    return [];
  }

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const entries: MemoryEntry[] = raw.map((e: any) => ({
      ...e,
      timestamp: new Date(e.timestamp),
    }));
    memoryIndex.set(conversationId, entries);
    return entries;
  } catch {
    memoryIndex.set(conversationId, []);
    return [];
  }
}

/**
 * Save a new turn to disk and in-memory index.
 * Embedding is computed asynchronously (non-blocking) after save.
 */
export async function saveTurn(
  conversationId: string,
  role: "user" | "assistant",
  content: string
): Promise<MemoryEntry> {
  const entries = loadConversation(conversationId);

  const entry: MemoryEntry = {
    id: crypto.randomUUID(),
    conversationId,
    timestamp: new Date(),
    role,
    content,
  };

  entries.push(entry);
  memoryIndex.set(conversationId, entries);

  // Persist to disk immediately (without vector — that's computed async)
  persistToDisk(conversationId, entries);

  // Compute and attach embedding asynchronously (non-blocking)
  embedText(content)
    .then((vector) => {
      entry.vector = vector;
      // No need to re-persist — vectors are rebuilt in memory from JSON on restart
    })
    .catch(() => {
      // Embedding failure is non-fatal — retrieval degrades to recency only
    });

  return entry;
}

/**
 * Retrieve the most recent N turns (short-term window).
 */
export function getRecentTurns(conversationId: string, n = 10): MemoryEntry[] {
  const entries = loadConversation(conversationId);
  return entries.slice(-n);
}

/**
 * Retrieve semantically similar past turns using cosine similarity.
 * Falls back to recency if embeddings aren't ready yet.
 */
export async function retrieveRelevantMemory(
  conversationId: string,
  query: string,
  options: { dateFilter?: Date; topK?: number } = {}
): Promise<MemoryEntry[]> {
  const entries = loadConversation(conversationId);
  const topK = options.topK ?? 5;

  // Apply date filter if provided
  let candidates = options.dateFilter
    ? entries.filter((e) => isSameDay(e.timestamp, options.dateFilter!))
    : entries;

  if (candidates.length === 0) return [];

  // Try semantic search if embeddings are available
  const entriesWithVectors = candidates.filter((e) => e.vector);
  if (entriesWithVectors.length > 0) {
    try {
      const queryVector = await embedText(query);
      const ranked = entriesWithVectors
        .map((e) => ({ entry: e, score: cosineSimilarity(queryVector, e.vector!) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map((r) => r.entry);
      return ranked;
    } catch {
      // Fall through to recency fallback
    }
  }

  // Recency fallback
  return candidates.slice(-topK);
}

/**
 * List all conversation IDs (for the sidebar).
 */
export function listConversations(): string[] {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
    .reverse(); // most recent first
}

function persistToDisk(conversationId: string, entries: MemoryEntry[]) {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // Persist without vector (vectors are large and rebuilt in memory)
  const toSave = entries.map(({ vector: _v, ...rest }) => ({
    ...rest,
    timestamp: rest.timestamp.toISOString(),
  }));
  fs.writeFileSync(getFilePath(conversationId), JSON.stringify(toSave, null, 2));
}
