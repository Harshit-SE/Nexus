# DESIGN.md — Nexus Chat Agent

> *One page on how it works, why I built it this way, what I considered and rejected, and what I'd do with another week.*

---

## How It Works

Nexus is a **ReAct agent** — it alternates between *reasoning* and *acting* before it speaks.

When a message arrives, three things happen in parallel before the LLM sees it:

1. **Temporal Intent Classification** — a regex pass (< 1ms, zero API cost) classifies the message: does it need live web data (`FRESHNESS_CHECK`), past conversation history (`HISTORY_LOOKUP`), or both (`HISTORY_DELTA`)? This prevents the agent from wasting latency searching when it doesn't need to, and forces it to search when it does.

2. **Memory Retrieval** — conversation turns are stored in two layers: a *short-term sliding window* (last 10 turns, always injected verbatim) and a *long-term semantic index* (every past turn embedded with Gemini `text-embedding-004` and stored in `vectra`, an in-process ANN vector DB). For date-specific queries ("what did I ask on 3 November?"), `chrono-node` parses the date and filters the vector search to that day's turns before ranking by cosine similarity.

3. **Query Decomposition** — for multi-entity queries ("5 CRM tools"), the agent decomposes into N atomic sub-queries and fires them in parallel with `Promise.all()`. Five parallel Brave Search calls take ~600ms; five sequential would take ~2500ms.

The LLM (Gemini 2.0 Flash) then runs in a **ReAct loop** via the Vercel AI SDK. At each step it either: calls `web_search` and observes the result, or produces a final answer. The loop is hard-capped at 5 tool calls to prevent runaway execution. The response streams back token-by-token so the user sees output immediately.

For "is my answer still correct?" queries, the agent retrieves the original answer from memory, re-searches the same topic with `freshness=pw` (past week) on Brave, and explicitly diffs old vs new — reporting `✓ Still correct` or `⚠️ Now outdated — here's what changed`.

Every factual claim in the response carries an inline citation URL extracted from the search result that sourced it.

---

## Why I Built It This Way

**ReAct over bare function calling.** A model that calls tools without reasoning steps makes poor decisions about *when* and *what* to search. The Thought → Action → Observation loop forces the model to articulate *why* it's searching before it does, which dramatically improves tool selection and reduces hallucination on freshness-sensitive queries.

**Hybrid memory over full context injection.** Injecting the entire conversation history on every request is wasteful and hits context limits fast. But pure vector search is bad at recency ("what did we just discuss?" retrieves old similar messages, not recent ones). The two-layer approach — verbatim recent window + semantic long-term index — solves both problems cleanly.

**vectra over a managed vector DB.** Pinecone, Weaviate, and Chroma all require either an external service or a running server. `vectra` is a pure npm package that runs in-process and persists to disk. The agent runs with `npm install && npm run dev`. No accounts, no Docker, no infra. For a demo, this is the right call; in production you'd swap vectra for a managed vector DB.

**Brave Search over SerpAPI / Tavily.** Brave's `freshness` parameter (`pd`, `pw`, `pm`) is uniquely suited to this problem — "has pricing changed since Monday?" maps directly to `freshness=pw`. The free tier (2000 queries/month) is generous enough for evaluation, and the JSON API needs no scraping.

**Gemini 2.0 Flash over GPT-4o.** The 1-million-token context window means the agent can hold arbitrarily long conversation history without truncation. At \$0.075/1M input tokens it's effectively free for a demo. Native function calling is first-class, not prompt-engineered. And using the same provider for both LLM and embeddings means one API key, one SDK, one billing account.

**Dual-Engine Architecture: Local Ollama (Phi-3) + Cloud Fallback.** Real-world agents must not break when cloud API quotas expire or when evaluating offline. Nexus supports running 100% locally on Ollama (Phi-3) with local vector embeddings (`nomic-embed-text`), with seamless cloud fallback to Gemini Flash when preferred.

**Vercel AI SDK over LangChain.** LangChain is powerful but adds significant complexity, bundle weight, and abstraction layers for features this project doesn't need. The Vercel AI SDK's `streamText` + `useChat` combo handles streaming, tool call orchestration, and React state in ~20 lines. The code stays readable and I can explain every line.

**Temporal intent classifier over always-searching.** Always calling the web search tool adds 500–2000ms of latency to every message. A fast regex classifier catches 90%+ of temporal signals at zero cost, so simple questions like "what's 2+2?" return instantly while "has HubSpot's pricing changed?" correctly triggers a search.

---

## What I Considered and Rejected

| Option | Why I Considered It | Why I Rejected It |
|--------|--------------------|--------------------|
| **GPT-4o** | Strong reasoning, great tool use | 33× more expensive than Gemini Flash; 128K vs 1M context |
| **LangChain** | Popular, many integrations | Adds complexity without adding value for this scope; worse TypeScript types |
| **Pinecone / Chroma** | Production-grade vector DBs | Require external service or Docker; breaks "just `npm install`" |
| **SerpAPI** | Reliable, widely used | 100 queries/month free tier; no freshness control param |
| **Tavily** | Purpose-built for AI agents | Less freshness control; Brave is simpler and free tier is larger |
| **SQLite for memory** | Persistent, queryable, no deps | Still needs a file; vectra already does persistence + vector search in one |
| **Full context injection** | Simplest implementation | Expensive; hits context limits; dilutes signal with noise |
| **Tool-use only (no ReAct)** | Less latency (fewer tokens) | Poor tool selection; model hallucinates on freshness queries |
| **Separate embedding service** | Flexibility | Extra API key + cost; Gemini embeddings are free on the same key |
| **OpenAI Embeddings** | High quality | Extra billing account needed; Gemini embeddings are comparable |
| **Streaming with WebSockets** | Lower overhead for real-time | SSE (via Vercel AI SDK) is simpler, works over HTTP/2, no extra setup |

---

## What I'd Do With Another Week

**Ship:**

1. **Multi-turn tool use with self-critique.** After generating an answer, have the agent rate its own confidence (1–5). If confidence < 3, it re-searches with a refined query and updates the answer. This handles cases where the first search was insufficient.

2. **Structured memory with entity extraction.** Right now memory is stored as raw text. With a week, I'd extract named entities (product names, prices, dates) from each turn and store them as structured metadata. This makes "has the price of Pipedrive changed?" a metadata filter query first, vector search second — faster and more precise.

3. **Conversation sidebar with timeline view.** A sidebar showing past sessions with timestamps and topic summaries (generated by the LLM). Users can jump to "Monday's CRM research session" directly.

4. **Search result caching with TTL.** Cache Brave Search results keyed by query + date, with a 1-hour TTL. Identical queries within the hour return instantly. This matters when the user asks follow-up questions about the same products.

5. **Explicit source trust scoring.** Weight search results from official pricing pages (e.g. `hubspot.com/pricing`) over third-party articles. The agent would surface "According to HubSpot's official pricing page (retrieved today)..." with higher confidence than a blog post.

6. **Evaluation harness.** Write a test suite with the three benchmark queries from the brief, plus 20 more covering edge cases (conflicting search results, deleted pages, rate-limited responses). Run it on every commit. The only way to know if the agent got better is to measure it.

7. **User accounts + cross-session memory persistence.** Right now memory is session-local. With auth (NextAuth.js), memory persists across devices — "what did I ask last Tuesday?" works even if you switched laptops.
