// lib/memory/embeddings.ts
// Gemini text-embedding-004 wrapper — same API key as the LLM, zero extra cost.

import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

/**
 * Embed a text string using Gemini text-embedding-004.
 * Returns a 768-dimensional float array.
 */
export async function embedText(text: string): Promise<number[]> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

/**
 * Cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
