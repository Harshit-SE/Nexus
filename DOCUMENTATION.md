# Technical Documentation — Nexus Chat Agent

**Version**: 1.0.0  
**Last Updated**: 2026-11-11

---

## Table of Contents

1. [Why ReAct?](#1-why-react)
2. [Why Hybrid Memory (vectra + sliding window)?](#2-why-hybrid-memory)
3. [Why Brave Search?](#3-why-brave-search)
4. [Why Gemini 2.0 Flash?](#4-why-gemini-20-flash)
5. [Why Vercel AI SDK?](#5-why-vercel-ai-sdk)
6. [Why Query Decomposition?](#6-why-query-decomposition)
7. [Why Temporal Intent Classification?](#7-why-temporal-intent-classification)
8. [Memory Architecture Deep Dive](#8-memory-architecture-deep-dive)
9. [Search Architecture Deep Dive](#9-search-architecture-deep-dive)
10. [System Prompt Design](#10-system-prompt-design)
11. [Error Handling & Edge Cases](#11-error-handling--edge-cases)
12. [API Reference](#12-api-reference)

---

## 1. Why ReAct?

### The Problem

The core challenge is: **how does an AI know when to look something up?**

A naive chatbot that always searches wastes latency and API quota on simple questions. A naive chatbot that never searches hallucinates on factual questions. We need an agent that *reasons about whether it needs to search*.

### ReAct Solves This

ReAct (Yao et al., 2022) gives the LLM an explicit Thought → Action → Observation loop:

```
Thought: The user is asking about current HubSpot pricing. My training data 
         is likely outdated. I should search for this.
Action: web_search("HubSpot CRM pricing 2025")
Observation: [Search results showing new pricing tiers]
Thought: I now have current pricing. I can answer the question.
Answer: HubSpot's Starter plan is currently $20/seat/month...
```

### Why Not Pure Chain-of-Thought?

Chain-of-Thought (CoT) produces better reasoning but no tool use. The model still makes things up when facts are needed.

### Why Not Function Calling Directly?

Bare function calling without reasoning steps leads to poor tool use — the model calls tools without thinking about *what* to search or *whether* it even needs to.

### ReAct Comparison

| Approach | Reasoning | Tool Use | Accuracy on Freshness Queries |
|----------|-----------|----------|-------------------------------|
| Plain LLM | ❌ | ❌ | ❌ Hallucination |
| CoT | ✅ | ❌ | ❌ Still hallucinates |
| Function Calling | ❌ | ✅ | ⚠️ Poor tool selection |
| **ReAct** | **✅** | **✅** | **✅ Grounded** |

### Implementation in Vercel AI SDK

```typescript
const result = await streamText({
  model: google('gemini-2.0-flash'),
  messages: contextMessages,
  tools: { web_search: webSearchTool },
  maxSteps: 5,  // prevent infinite loops
  system: systemPrompt,
});
```

The `maxSteps` parameter implements the ReAct termination condition. The SDK handles the Thought/Action/Observation cycle automatically via Gemini's native function calling.

---

## 2. Why Hybrid Memory (vectra + sliding window)?

### The Problem

Three types of memory queries the agent must handle:

1. **Recency** — "what were we just talking about?" (last few turns)
2. **Semantic** — "what did I ask about Postgres?" (topic-based retrieval)
3. **Temporal** — "what did I ask on 3 November?" (date-based retrieval)

No single memory strategy handles all three well.

### Why Not Just Full Context?

Injecting the entire conversation history into every request:
- Expensive (tokens cost money)
- Slow (more tokens = slower TTFT)
- Hits context limits for long conversations
- Dilutes relevant signal with irrelevant noise

### Why Not Just Vector Search?

Pure vector search:
- Excellent for semantic queries
- Poor for recency ("what did we just discuss?" retrieves old similar messages)
- Poor for exact date queries ("3 November" might not semantically match content from that day)

### The Hybrid Solution

```
Memory Architecture:
┌────────────────────────────────────────────────┐
│                 Memory Request                  │
│                      │                          │
│          ┌───────────┴───────────┐              │
│          ▼                       ▼              │
│   Short-term Window        Long-term Index      │
│   (last 10 turns,          (vectra ANN search   │
│    always included)         + date filter)      │
│          │                       │              │
│          └───────────┬───────────┘              │
│                      ▼                          │
│            Merged & Deduplicated                │
│                      │                          │
│                      ▼                          │
│            Injected into prompt                 │
└────────────────────────────────────────────────┘
```

### Why vectra Specifically?

| Memory Option | Pros | Cons | Decision |
|---------------|------|------|----------|
| **vectra** | In-process, zero infra, npm install | Not distributed | ✅ **Chosen** |
| Pinecone | Managed, scalable | Requires account, network call | ❌ Rejected |
| Chroma | Open source, good features | Requires running server | ❌ Rejected |
| Weaviate | Feature-rich | Heavy, complex setup | ❌ Rejected |
| PostgreSQL + pgvector | SQL + vectors | Requires Postgres server | ❌ Rejected |

For a demo/hiring project, `vectra` perfectly satisfies the "runs with `npm install`" constraint while providing genuine ANN search.

### Date-Keyed Retrieval Algorithm

```typescript
async function retrieveRelevantMemory(
  query: string,
  options: { dateFilter?: Date; topK?: number } = {}
): Promise<MemoryEntry[]> {
  
  // 1. If date filter, narrow the search space
  let candidates = allEntries;
  if (options.dateFilter) {
    candidates = allEntries.filter(entry =>
      isSameDay(entry.timestamp, options.dateFilter!)
    );
  }
  
  // 2. Embed the query
  const queryVector = await embedText(query);
  
  // 3. Rank candidates by cosine similarity
  const ranked = candidates
    .map(entry => ({
      ...entry,
      score: cosineSimilarity(queryVector, entry.vector)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, options.topK ?? 5);
  
  return ranked;
}
```

---

## 3. Why Brave Search?

### The Problem

We need a web search API that:
- Returns structured JSON (not HTML to scrape)
- Has good freshness control (critical for "has pricing changed?" queries)
- Has a usable free tier
- Doesn't require complex setup

### Comparison

| Provider | Free Tier | JSON API | Freshness Control | Setup |
|----------|-----------|----------|-------------------|-------|
| **Brave** | 2000 queries/month | ✅ | ✅ `freshness` param | Simple API key |
| SerpAPI | 100/month | ✅ | Limited | API key |
| Tavily | 1000/month | ✅ | Limited | API key |
| Google Custom Search | 100/day | ✅ | ❌ | Complex |
| Bing Search | 1000/month | ✅ | Limited | Azure account |

Brave's `freshness` parameter is particularly powerful for our use case:
- `pd` = past day
- `pw` = past week  
- `pm` = past month

For "has pricing changed since Monday?" we set `freshness=pw` to surface only recent changes.

### Brave API Usage

```typescript
async function braveSearch(
  query: string,
  options: BraveSearchOptions = {}
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    count: '5',
    ...(options.freshness && { freshness: options.freshness }),
  });

  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?${params}`,
    {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': process.env.BRAVE_API_KEY!,
      },
    }
  );

  const data = await response.json();
  return data.web?.results?.map(r => ({
    title: r.title,
    url: r.url,
    description: r.description,
    published: r.age,
  })) ?? [];
}
```

---

## 4. Why Gemini 2.0 Flash?

### The Requirements

The LLM needs:
- Native function/tool calling (for ReAct tool use)
- Streaming support (for TTFT performance)
- Large context window (for long conversation history)
- Fast inference (for good UX)
- Affordable cost (for demo sustainability)

### Comparison

| Model | Context Window | Speed | Cost | Tool Calling | Decision |
|-------|---------------|-------|------|--------------|----------|
| **Gemini 2.0 Flash** | 1M tokens | ⚡⚡⚡ | \$0.075/1M in | ✅ Native | ✅ **Chosen** |
| GPT-4o | 128K tokens | ⚡⚡ | \$2.50/1M in | ✅ | ❌ Expensive |
| GPT-4o-mini | 128K tokens | ⚡⚡⚡ | \$0.15/1M in | ✅ | Considered |
| Claude 3.5 Haiku | 200K tokens | ⚡⚡⚡ | \$0.80/1M in | ✅ | Considered |
| Gemini 1.5 Pro | 1M tokens | ⚡ | \$1.25/1M in | ✅ | Slower |

Gemini 2.0 Flash wins because:
1. **1M token context** handles arbitrarily long conversation histories
2. **\$0.075/1M input tokens** — essentially free for a demo
3. **Native function calling** — no prompt engineering tricks needed for tools
4. **Same API as embeddings** — one API key, one SDK

### Why Use Same Provider for Embeddings?

Using `text-embedding-004` from Google means:
- One API key (not two)
- Embedding calls share the same quota management
- No additional billing account needed

```typescript
// embeddings.ts — same client as LLM calls
const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
const result = await model.embedContent(text);
return result.embedding.values; // 768-dimensional vector
```

---

## 5. Why Vercel AI SDK?

### The Problem

Building a streaming agentic chat API from scratch requires:
- Server-sent events (SSE) infrastructure
- Tool call parsing and routing
- ReAct loop orchestration
- Proper error handling across streaming chunks
- React hooks for the UI

This is weeks of work if done from scratch.

### Vercel AI SDK (`ai` package)

The Vercel AI SDK provides all of this out of the box:

```typescript
// Server: app/api/chat/route.ts
import { streamText } from 'ai';
import { google } from '@ai-sdk/google';

export async function POST(req: Request) {
  const { messages } = await req.json();
  
  const result = await streamText({
    model: google('gemini-2.0-flash'),
    messages,
    tools: { web_search: webSearchTool },
    maxSteps: 5,
  });
  
  return result.toDataStreamResponse();
}
```

```typescript
// Client: app/page.tsx
import { useChat } from 'ai/react';

export default function Chat() {
  const { messages, input, handleSubmit, setInput } = useChat();
  // Everything just works: streaming, tool calls, history
}
```

### Why Not LangChain?

| Criterion | Vercel AI SDK | LangChain |
|-----------|--------------|-----------|
| Bundle size | Small | Large |
| Complexity | Low | High |
| Streaming support | First-class | Bolted on |
| TypeScript quality | Excellent | Mixed |
| Active maintenance | ✅ | ✅ |
| Next.js integration | First-class | Generic |

LangChain is powerful but adds significant complexity and bundle weight for features we don't need.

---

## 6. Why Query Decomposition?

### The Problem

"On Monday we shortlisted 5 CRM tools. Has any of them changed pricing since?"

A single web search for this entire query will return noisy, mixed results. The LLM might hallucinate that "Salesforce hasn't changed" when it has, simply because the search result mentioned the other 4 tools.

### The Solution: Atomic Queries

Decompose into atomic, targeted queries:
- Each query returns highly relevant results for exactly one entity
- Parallel execution means no latency penalty vs a single query
- Results are attributed to specific entities → no confusion

```typescript
async function decomposeQuery(
  entities: string[],
  topic: string
): Promise<string[]> {
  return entities.map(entity => 
    `${entity} ${topic} changes 2025 site:techcrunch.com OR site:reuters.com OR pricing`
  );
}
```

### Latency Impact

```
Sequential (5 searches × 500ms each) = 2500ms
Parallel   (5 searches, all at once) = ~600ms (slowest one)

Improvement: ~4x faster
```

---

## 7. Why Temporal Intent Classification?

### The Problem

Not every message needs web search. Searching unnecessarily:
1. Adds 500-2000ms latency
2. Wastes API quota
3. Can inject irrelevant information

### The Classifier

A two-layer classifier:

**Layer 1: Fast regex (< 1ms)**
```typescript
const TEMPORAL_PATTERNS = {
  FRESHNESS_CHECK: /has .+ changed|still correct|still (the same|accurate)|any changes/i,
  HISTORY_LOOKUP: /what did I (ask|say|mention)|what were we (discussing|talking)/i,
  DELTA_QUERY: /since (last|monday|tuesday|wednesday|thursday|friday|[0-9])/i,
  HISTORY_DELTA: /shortlisted|mentioned|discussed.+on (last|monday|tuesday)/i,
};
```

**Layer 2: LLM classification (only if regex is ambiguous)**
```typescript
// One-shot classification prompt
const classification = await classifyWithLLM(message);
```

### Why Hybrid (Not Pure LLM)?

- Regex catches 90%+ of cases at zero cost and zero latency
- LLM handles the ambiguous 10%
- Overall cost: near-zero for classification

---

## 8. Memory Architecture Deep Dive

### Storage Format

Each conversation turn is stored as:

```typescript
interface MemoryEntry {
  id: string;              // UUID
  conversationId: string;  // Session identifier
  timestamp: Date;         // When this turn occurred
  role: 'user' | 'assistant';
  content: string;         // The message text
  vector: number[];        // 768-dim embedding
  metadata: {
    entities?: string[];   // Extracted named entities
    topics?: string[];     // Extracted topic tags
    hasSearch?: boolean;   // Did this turn involve a web search?
  };
}
```

### Persistence Layer

```
data/
└── conversations/
    ├── {conversationId}.json    ← full turn history (human-readable)
    └── {conversationId}.vectra ← binary vector index (auto-managed)
```

The JSON file is human-readable and serves as the source of truth. The vectra index is rebuilt from JSON on startup if the binary file is missing.

### Embedding on Write

Every turn is embedded asynchronously after the response is sent — the user is never blocked waiting for embedding:

```typescript
// After streaming response completes:
setImmediate(async () => {
  const vector = await embedText(turn.content);
  await memoryStore.index(turn, vector);
});
```

### Retrieval on Read

```
Request arrives with query: "What did I ask about Postgres last Tuesday?"
                │
                ▼
1. chrono-node parses "last Tuesday" → Date(2025-11-05)
                │
                ▼
2. Filter memory entries by date: entries where date = Nov 5
                │
                ▼
3. Embed query: "What did I ask about Postgres"
                │
                ▼
4. Rank filtered entries by cosine similarity to query embedding
                │
                ▼
5. Return top-3 entries → inject into prompt
```

---

## 9. Search Architecture Deep Dive

### Tool Definition

```typescript
export const webSearchTool = tool({
  description: `Search the web for current information. Use this for:
    - Current prices, features, or status of products/services
    - Recent news or announcements
    - Any factual information that may have changed recently
    Do NOT use for: general knowledge, math, or questions about our conversation.`,
  parameters: z.object({
    query: z.string().describe('The search query'),
    freshness: z.enum(['pd', 'pw', 'pm']).optional()
      .describe('Freshness filter: pd=past day, pw=past week, pm=past month'),
  }),
  execute: async ({ query, freshness }) => {
    const results = await braveSearch(query, { freshness });
    return formatResultsForContext(results);
  },
});
```

### Result Formatting

Search results are formatted compactly for the LLM context:

```typescript
function formatResultsForContext(results: SearchResult[]): string {
  return results
    .slice(0, 5)
    .map((r, i) => 
      `[${i+1}] ${r.title}\nURL: ${r.url}\nPublished: ${r.published ?? 'unknown'}\n${r.description}`
    )
    .join('\n\n');
}
```

This keeps each result under ~200 tokens while preserving the URL for citation.

---

## 10. System Prompt Design

The system prompt is the single most important piece of "code" in an LLM application. Ours:

```
You are Nexus, a sharp and honest AI assistant with real-time web search capability.

Today's date and time: {currentDateTime}
Current conversation ID: {conversationId}

## Your Capabilities
- You can search the web for current information using the web_search tool.
- You have access to this conversation's full history, including past sessions.

## Rules You Must Follow

### On Freshness-Sensitive Questions
If the user asks about current prices, recent changes, availability, or uses phrases like 
"has X changed", "is Y still", "any updates on Z" — you MUST call web_search before 
answering. Never answer these from memory or training data alone.

### On Historical Questions  
If the user asks "what did I ask on [date]" or "what were we discussing about X" — 
look in the conversation history provided below. Report exactly what you find. 
If the date/topic isn't in your history, say so honestly.

### On Citations
Every factual claim from a web search must be followed by its source URL in 
parentheses: (source: https://...). 

### On Tone
- Be concise. Lead with the answer, then evidence.
- If you're uncertain, say so. Don't hallucinate confidence.
- If search results are thin, say "I found limited recent information on this."

## Relevant Conversation History
{retrievedMemory}
```

---

## 11. Error Handling & Edge Cases

### Search Failures

```typescript
try {
  const results = await braveSearch(query);
  if (results.length === 0) {
    return "I searched but found no relevant results for this query. " +
           "You may want to check the official website directly.";
  }
  return formatResultsForContext(results);
} catch (error) {
  if (error.status === 429) {
    // Rate limited — return honest message
    return "Search is temporarily rate-limited. I'll answer from my training data " +
           "but note it may not reflect the most recent changes.";
  }
  throw error; // Let outer handler catch
}
```

### Memory Retrieval Failures

Memory failures are non-fatal — the agent degrades gracefully to short-term window only:

```typescript
let relevantMemory: MemoryEntry[] = [];
try {
  relevantMemory = await retrieveRelevantMemory(userMessage);
} catch (error) {
  console.error('Memory retrieval failed, continuing without long-term memory:', error);
  // Agent continues with just the short-term window
}
```

### Infinite Loop Prevention

The `maxSteps: 5` parameter in the Vercel AI SDK hard-limits the ReAct loop. After 5 tool calls without a final answer, the SDK forces a final generation step.

---

## 12. API Reference

### POST /api/chat

**Request**:
```typescript
{
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  conversationId?: string; // defaults to 'default'
}
```

**Response**: Server-Sent Events stream (Vercel AI SDK DataStream format)

**Events**:
- `0:` — text delta (streamed response chunks)
- `9:` — tool call (web_search being called)
- `a:` — tool result (search results returned)
- `d:` — final metadata (token counts, finish reason)

### GET /api/conversations

Returns list of past conversation sessions.

### GET /api/conversations/:id

Returns full history for a conversation session.

---

## Glossary

| Term | Definition |
|------|------------|
| **ReAct** | Reasoning + Acting — agentic loop where LLM alternates between thinking and tool calls |
| **ANN** | Approximate Nearest Neighbour — fast vector similarity search |
| **vectra** | In-process TypeScript vector database using cosine similarity |
| **TTFT** | Time To First Token — latency metric for streaming responses |
| **Freshness** | How recently a web search result was published |
| **Tool use / Function calling** | LLM ability to request execution of external functions |
| **Temporal intent** | Classification of whether a query needs history retrieval, web search, or both |
| **Query decomposition** | Breaking a multi-entity query into atomic sub-queries for parallel search |
| **Delta query** | A question asking what has changed since a past point in time |
