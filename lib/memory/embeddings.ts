// lib/memory/embeddings.ts
// Dual embedding engine: Local Ollama (nomic-embed-text) with cloud Gemini fallback.

import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI | null {
  if (!genAI) {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (apiKey) {
      genAI = new GoogleGenerativeAI(apiKey);
    }
  }
  return genAI;
}

/**
 * Embed text string:
 * 1. Checks local Ollama (nomic-embed-text:latest) — instant, zero external API call
 * 2. Falls back to Gemini embedding model
 */
export async function embedText(text: string): Promise<number[]> {
  // 1. Try local Ollama embedding first (fast & local)
  try {
    const res = await fetch("http://127.0.0.1:11434/api/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "nomic-embed-text:latest",
        prompt: text,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.embedding) && data.embedding.length > 0) {
        return data.embedding;
      }
    }
  } catch {
    // Fall through to cloud embedding
  }

  // 2. Fall back to Gemini cloud embedding
  const client = getClient();
  if (client) {
    try {
      const model = client.getGenerativeModel({ model: "gemini-embedding-001" });
      const result = await model.embedContent(text);
      return result.embedding.values;
    } catch {
      // Return zero vector fallback
    }
  }

  // 3. Fallback deterministic character n-gram pseudo-embedding if completely offline
  return fallbackEmbedding(text, 768);
}

function fallbackEmbedding(text: string, dims = 768): number[] {
  const vec = new Array(dims).fill(0);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const pos = (code * 31 + i) % dims;
    vec[pos] += 1;
  }
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
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
