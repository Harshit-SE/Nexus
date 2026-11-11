// tests/verify-algorithms.ts
// Unit verification of core algorithms:
// 1. Temporal Intent Classification on the prompt test dataset
// 2. Natural language date parsing (chrono-node)
// 3. Cosine similarity math
// 4. Memory persistence (JSON save/load)

import { classifyTemporalIntent } from "../lib/agent/temporal";
import { parseNaturalDate, isSameDay } from "../lib/utils/dates";
import { cosineSimilarity } from "../lib/memory/embeddings";
import { saveTurn, loadConversation } from "../lib/memory/store";

let passed = 0;
let total = 0;

function assert(condition: boolean, desc: string) {
  total++;
  if (condition) {
    console.log(`  ✓ ${desc}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${desc}`);
  }
}

async function runTests() {
  console.log("\n--- TEST SUITE: Core Algorithms Verification ---\n");

  // ── 1. Temporal Intent Classification on Benchmark Queries ──────────────
  console.log("1. Benchmark Query Classification:");

  const q1 =
    "On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?";
  const c1 = classifyTemporalIntent(q1);
  assert(
    c1.intent === "HISTORY_DELTA" && c1.needsHistory && c1.needsWebSearch,
    `Q1 correctly identified as HISTORY_DELTA (needs history + search): intent=${c1.intent}`
  );

  const q2 =
    "What did I ask you on 3 November? Is your answer still correct today?";
  const c2 = classifyTemporalIntent(q2);
  assert(
    c2.needsHistory || c2.needsWebSearch,
    `Q2 triggers history lookup or freshness check: intent=${c2.intent}`
  );

  const q3 =
    "Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?";
  const c3 = classifyTemporalIntent(q3);
  assert(
    c3.intent === "HISTORY_DELTA" || (c3.needsHistory && c3.needsWebSearch),
    `Q3 correctly triggers both history and web search: intent=${c3.intent}`
  );

  const qGeneral = "What is the capital of France?";
  const cGeneral = classifyTemporalIntent(qGeneral);
  assert(
    cGeneral.intent === "NONE" && !cGeneral.needsWebSearch && !cGeneral.needsHistory,
    "General query correctly bypasses temporal handling"
  );

  // ── 2. Date Parsing ───────────────────────────────────────────────────────
  console.log("\n2. Natural Language Date Parsing:");

  const d1 = parseNaturalDate("on Monday");
  assert(d1 instanceof Date, "Parsed 'on Monday' to Date object");

  const d2 = parseNaturalDate("last Tuesday");
  assert(d2 instanceof Date, "Parsed 'last Tuesday' to Date object");

  const d3 = parseNaturalDate("3 November");
  assert(d3 instanceof Date && d3.getMonth() === 10, "Parsed '3 November' to November");

  // ── 3. Cosine Similarity ──────────────────────────────────────────────────
  console.log("\n3. Cosine Similarity Math:");

  const vA = [1, 0, 0];
  const vB = [1, 0, 0];
  const vC = [0, 1, 0];
  assert(
    Math.abs(cosineSimilarity(vA, vB) - 1.0) < 1e-6,
    "Identical vectors yield similarity 1.0"
  );
  assert(
    Math.abs(cosineSimilarity(vA, vC) - 0.0) < 1e-6,
    "Orthogonal vectors yield similarity 0.0"
  );

  // ── 4. Memory Persistence ─────────────────────────────────────────────────
  console.log("\n4. Memory Persistence Roundtrip:");

  const testSessionId = `test-session-${Date.now()}`;
  await saveTurn(
    testSessionId,
    "user",
    "We shortlisted HubSpot and Salesforce on Monday."
  );
  await saveTurn(
    testSessionId,
    "assistant",
    "HubSpot starts at $20/seat and Salesforce starts at $25/seat."
  );

  const turns = loadConversation(testSessionId);
  assert(turns.length === 2, `Loaded 2 turns from disk for ${testSessionId}`);
  assert(
    turns[0].role === "user" && turns[1].role === "assistant",
    "Turn roles preserved correctly"
  );
  assert(
    turns[0].content.includes("HubSpot"),
    "Turn content preserved correctly"
  );

  console.log(`\n========================================`);
  console.log(`Result: ${passed}/${total} assertions passed (${Math.round((passed / total) * 100)}%)`);
  console.log(`========================================\n`);

  if (passed !== total) process.exit(1);
}

runTests().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
