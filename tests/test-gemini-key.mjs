// tests/test-gemini-key.mjs
// Verifies your Gemini API key for:
// 1. Text generation via @ai-sdk/google (gemini-flash-latest)
// 2. Vector embeddings (gemini-embedding-001)

import fs from "fs";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { GoogleGenerativeAI } from "@google/generative-ai";

let apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

if (!apiKey && fs.existsSync(".env.local")) {
  const content = fs.readFileSync(".env.local", "utf8");
  const match = content.match(/GOOGLE_GENERATIVE_AI_API_KEY=(.*)/);
  if (match) apiKey = match[1].trim();
}

if (!apiKey) {
  console.error("❌ Error: No Gemini API key found in .env.local");
  process.exit(1);
}

process.env.GOOGLE_GENERATIVE_AI_API_KEY = apiKey;

console.log("\n========================================================");
console.log("       TESTING GEMINI API KEY CONNECTIVITY               ");
console.log("========================================================\n");
console.log(`🔑 Key prefix: ${apiKey.slice(0, 8)}... (length: ${apiKey.length})\n`);

async function runTests() {
  // Test 1: Text Generation
  console.log("1. Testing Text Generation (gemini-flash-latest)...");
  try {
    const res = await generateText({
      model: google("gemini-flash-latest"),
      prompt: "Respond with: 'Gemini API is verified and operational!'",
    });
    console.log(`  ✓ Success! Response:\n    "${res.text.trim()}"\n`);
  } catch (err) {
    console.error(`  ❌ Generation failed: ${err.message}\n`);
  }

  // Test 2: Vector Embedding
  console.log("2. Testing Vector Embedding (gemini-embedding-001)...");
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const embedModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const embedResult = await embedModel.embedContent("Nexus memory embedding test");
    const values = embedResult.embedding.values;
    console.log(`  ✓ Success! Generated embedding vector (${values.length} dimensions).`);
    console.log(`    Sample: [${values.slice(0, 3).map(v => v.toFixed(4)).join(", ")}, ...]\n`);
  } catch (err) {
    console.error(`  ❌ Embedding failed: ${err.message}\n`);
  }

  console.log("========================================================\n");
}

runTests();
