# Implementation Guide — Web Search Chat Agent

## Overview

This guide describes the full architecture, algorithms, and step-by-step implementation plan for building a production-quality chat agent with web search, capable of answering questions like:

- "On Monday we shortlisted 5 CRM tools. Has pricing changed since?"
- "What did I ask you on 3 November? Is your answer still correct today?"
- "Last Tuesday I asked about Postgres hosting. Has pricing changed?"

---

## Core Algorithm: ReAct (Reasoning + Acting) with Persistent Memory

### Why ReAct?

ReAct is the gold-standard agentic loop for chat + tool use. The model alternates between:
1. **Reasoning** — thinking about what it knows and what it still needs
2. **Acting** — calling tools (web search) to fetch live information
3. **Observing** — reading tool outputs and folding them into context
4. **Responding** — producing a final answer grounded in live data

This directly handles the test queries because every answer requires checking *current* state against *past* conversation context.

```
User Message
     │
     ▼
┌──────────────────────────────────┐
│         ReAct Agent Loop         │
│                                  │
│  1. Load conversation memory     │
│  2. Reason: do I need live data? │
│  3. If YES → call web_search()   │
│  4. Observe search results       │
│  5. Repeat until confident       │
│  6. Generate grounded response   │
└──────────────────────────────────┘
     │
     ▼
  Response + Memory saved
```

---

## Algorithm Details

### 1. Temporal Intent Detection

Before the agent loop runs, a **pre-pass** classifies the user message:

| Signal | Example | Action |
|--------|---------|--------|
| `"has X changed"` | "has pricing changed" | Force web search |
| `"still correct"` | "is your answer still correct?" | Force web search + retrieve past message |
| `"what did I ask"` | "what did I ask on 3 Nov?" | Retrieve conversation history |
| `"since [date]"` | "since last Tuesday" | Compute date, force search |

This regex+LLM hybrid classifier costs ~zero tokens and prevents the agent from hallucinating answers to freshness-sensitive questions.

### 2. Conversation Memory with Semantic Indexing

**Algorithm: Sliding Window + Semantic Retrieval (Hybrid Memory)**

- **Short-term (last N turns)**: Always injected verbatim into the prompt. Window = last 10 turns.
- **Long-term (all past turns)**: Each turn is embedded and stored in a vector index (`vectra` - lightweight in-process vector DB for Node.js). On retrieval, top-k semantically similar past turns are fetched.

```
Every user message → embed → store in vectra index
                                    │
                           ┌────────┴────────┐
                           │  Vector Search  │◄── "What did I ask on Nov 3?"
                           │   (cosine sim)  │
                           └────────┬────────┘
                                    │
                           Top-k relevant past turns
                                    │
                           Injected into prompt context
```

**Date-keyed retrieval**: Each memory entry stores `{ timestamp, role, content, embedding }`. When the user says "what did I ask on 3 November?", a date-filter runs first (exact date match), then semantic search within that day's turns.

### 3. Web Search Tool

**Algorithm: Query Decomposition + Parallel Fetch + Result Synthesis**

For complex queries (e.g., "Have any of these 5 CRMs changed pricing?"), the agent:

1. **Decomposes** the query into N atomic sub-queries: `["Salesforce pricing 2024", "HubSpot pricing 2024", ...]`
2. **Fetches in parallel** using `Promise.all()` — minimises latency
3. **Synthesises** all results into one coherent answer with citations

```
"Has pricing changed for HubSpot, Pipedrive, Zoho, Freshsales, Monday CRM?"
                │
                ▼
      Query Decomposition (LLM)
                │
    ┌───────────┼───────────┐
    ▼           ▼           ▼
 Search #1   Search #2   Search #3  ... (parallel, Promise.all)
    │           │           │
    └───────────┼───────────┘
                ▼
         Result Synthesis (LLM)
                │
                ▼
      Grounded answer with citations
```

**Search provider**: Brave Search API (free tier generous, good freshness, no HTML scraping needed, JSON API).

### 4. Result Freshness Verification

For "is my answer still correct?" queries:
1. Extract the original answer from conversation history
2. Re-run a targeted web search for the same topic
3. Diff the old answer against new evidence
4. Report: "Still correct ✓" or "Now outdated — here's what changed: ..."

---

## Technology Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | Node.js 20 + TypeScript | Required by spec |
| LLM | Google Gemini 2.0 Flash | Fast, cheap, 1M context, function calling |
| Agent Framework | Vercel AI SDK (`ai` package) | Native streaming + tool calling, production-proven |
| Web Search | Brave Search API | JSON API, great freshness, generous free tier |
| Memory DB | `vectra` (in-process vector DB) | Zero infra, embeds in Node process |
| Embeddings | Gemini `text-embedding-004` | Same API key, no extra cost |
| UI | Next.js 14 App Router + `useChat` hook | Pairs perfectly with Vercel AI SDK |
| Styling | Tailwind CSS | Fast to build good-looking UI |
| Persistence | JSON file (SQLite optional) | Simple, no infra needed to run |

---

## Implementation Phases

### Phase 1 — Core Agent + Search (Day 1)
1. Bootstrap Next.js project with TypeScript
2. Implement `web_search` tool wrapping Brave API
3. Implement ReAct agent loop with Gemini via Vercel AI SDK
4. Build chat UI with streaming responses
5. Test with simple live-info queries

### Phase 2 — Persistent Memory + Temporal Reasoning (Day 2)
1. Implement conversation persistence (JSON → vectra index)
2. Implement date-keyed memory retrieval
3. Implement temporal intent classifier
4. Implement query decomposition for multi-entity searches
5. Test "what did I ask on Nov 3?" and "has pricing changed?" queries

### Phase 3 — Polish, Citations & DESIGN.md (Day 3)
1. Add inline citations with URLs in responses
2. Add "searching…" streaming indicators
3. Add source cards in UI
4. Write DESIGN.md
5. Final end-to-end testing

---

## Directory Structure

```
hiring-project/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts          ← ReAct agent endpoint
│   ├── page.tsx                  ← Chat UI
│   └── layout.tsx
├── lib/
│   ├── agent/
│   │   ├── loop.ts               ← ReAct loop orchestration
│   │   ├── tools.ts              ← web_search tool definition
│   │   └── temporal.ts           ← intent detection, date parsing
│   ├── memory/
│   │   ├── store.ts              ← vectra index + JSON persistence
│   │   ├── retrieval.ts          ← semantic + date-keyed retrieval
│   │   └── embeddings.ts         ← Gemini embedding calls
│   ├── search/
│   │   ├── brave.ts              ← Brave API wrapper
│   │   └── decompose.ts          ← query decomposition
│   └── utils/
│       ├── dates.ts              ← natural language date parsing
│       └── citations.ts          ← URL extraction + formatting
├── components/
│   ├── ChatWindow.tsx
│   ├── MessageBubble.tsx
│   └── SearchIndicator.tsx
├── data/
│   └── conversations/            ← persistent JSON store
├── .env.example
├── DESIGN.md
├── IMPLEMENTATION_GUIDE.md
├── TRACKER.md
├── REPORT.md
└── README.md
```

---

## Key Function Signatures

```typescript
// ReAct loop — lib/agent/loop.ts
async function runAgentLoop(
  messages: Message[],
  conversationId: string,
  onToolCall?: (tool: string, args: object) => void
): Promise<StreamingResponse>

// Web search — lib/search/brave.ts
async function braveSearch(
  query: string,
  options?: { freshness?: 'pd' | 'pw' | 'pm' }
): Promise<SearchResult[]>

// Query decomposition — lib/search/decompose.ts
async function decomposeQuery(
  userMessage: string,
  context: string
): Promise<string[]>

// Memory retrieval — lib/memory/retrieval.ts
async function retrieveRelevantMemory(
  query: string,
  options?: { dateFilter?: Date; topK?: number }
): Promise<MemoryEntry[]>

// Temporal intent — lib/agent/temporal.ts
function classifyTemporalIntent(message: string): {
  needsSearch: boolean;
  needsHistory: boolean;
  referenceDate?: Date;
  entities?: string[];
}
```

---

## System Prompt Strategy

The system prompt is carefully crafted to:
1. **Ground the agent in time**: inject current date/time on every request
2. **Enforce citation**: require URLs for every factual claim
3. **Force freshness checking**: on delta queries ("has X changed?"), must search before answering
4. **Handle "what did I ask" gracefully**: refer to injected memory, not hallucinate

```
You are a sharp, honest AI assistant with real-time web access.
Today is {currentDate}.

RULES:
1. For ANY question about current prices, recent changes, or "is X still Y":
   → You MUST call web_search before answering. Never guess from training data.
2. For "what did I ask on [date]": look at the conversation history provided.
   → If no history exists for that date, say so honestly.
3. Always cite your sources with URLs inline.
4. Be concise. Lead with the answer, then evidence.
```

---

## Edge Cases Handled

| Edge Case | Handling |
|-----------|----------|
| User asks about past conversation from days ago | vectra date-filtered retrieval |
| Multi-entity query ("5 CRM tools") | Parallel query decomposition |
| Search returns stale cached results | `freshness=pw` (past week) param in Brave |
| Agent loops indefinitely | Max 5 tool call iterations hard limit |
| No relevant search results | Honest "I couldn't find current data" response |
| Date parsing ("last Tuesday") | `chrono-node` natural language date parser |

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Simple query (no search needed) | < 2s to first token |
| Single search query | < 4s to first token |
| Multi-entity parallel search (5 items) | < 6s to first token |
| Memory retrieval (10k turns indexed) | < 100ms |
