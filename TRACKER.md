# Project Tracker — Web Search Chat Agent

**Project**: Hiring Project — Chat Agent with Web Search  
**Goal**: Build the best-architected chat agent with web search  
**Start Date**: 2026-11-11  
**Status**: 🟢 Final Submission Ready — All 3 Phases Complete & Verified (17/17 Checks Passed)

---

## Phases Overview

| Phase | Name | Status | ETA |
|---|---|---|---|
| 1 | Core Agent + Hermes Web Search | 🟢 Complete | Day 1 |
| 2 | Persistent Memory + Temporal Reasoning | 🟢 Complete | Day 2 |
| 3 | Polish, Citations & Architecture Documentation | 🟢 Complete | Day 3 |

---

## Phase 1 — Core Agent + Search

**Goal**: Working chat interface that can answer live questions using web search.

**Status**: 🟢 Complete

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.1 | Bootstrap Next.js 16 project with TypeScript | ✅ | Turbopack + TypeScript + Tailwind v4 |
| 1.2 | Multi-tier LLM engine | ✅ | NVIDIA Nemotron 70B, Local Ollama (Phi-3), Resilient Synthesizer |
| 1.3 | Set up `.env.example` with required keys | ✅ | `NVIDIA_API_KEY`, `OLLAMA_MODEL`, `SEARCH_PROVIDER` |
| 1.4 | Implement Hermes Web Search (`lib/search/hermes.ts`) | ✅ | Type-safe structured extraction, freshness filters |
| 1.5 | Define `web_search` tool for the agent (`lib/agent/tools.ts`) | ✅ | `tool()` with inputSchema & parallel multi-query |
| 1.6 | Implement ReAct agent route (`app/api/chat/route.ts`) | ✅ | Streaming SSE with zero-delay failover |
| 1.7 | Build streaming Chat UI (`app/page.tsx`, `components/`) | ✅ | Token-by-token streaming, Markdown |
| 1.8 | Add "Searching…" indicator in UI | ✅ | Shows live queries while tool runs |
| 1.9 | Local end-to-end test: build verification | ✅ | `npm run build` succeeds cleanly (0 errors) |

**Phase 1 Definition of Done**: User can run `npm install` then `npm run dev` and get a streamed response that calls live web search.

---

## Phase 2 — Persistent Memory + Temporal Reasoning

**Goal**: Agent remembers past conversations and handles "what did I ask on Tuesday?" and "has pricing changed since?" queries correctly.

**Status**: 🟢 Complete

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.1 | Add conversation persistence (JSON file per session) | ✅ | `data/conversations/{id}.json` |
| 2.2 | In-memory vector similarity + cosine index | ✅ | Fast ANN vector math in `lib/memory/embeddings.ts` |
| 2.3 | Gemini embedding integration (`lib/memory/embeddings.ts`) | ✅ | `text-embedding-004` (768-dim) |
| 2.4 | Memory store with non-blocking write (`lib/memory/store.ts`) | ✅ | Asynchronous embedding generation |
| 2.5 | Date-keyed + semantic retrieval (`lib/memory/store.ts`) | ✅ | Filter by calendar day, then cosine rank |
| 2.6 | Natural language date parsing (`lib/utils/dates.ts`) | ✅ | `chrono-node` handles "last Tuesday", "on Monday", "3 Nov" |
| 2.7 | Temporal intent classifier (`lib/agent/temporal.ts`) | ✅ | Regex patterns (< 1ms, zero API cost) |
| 2.8 | Parallel multi-entity search (`lib/search/decompose.ts`) | ✅ | Query decomposition + `Promise.all` |
| 2.9 | Memory injection into system prompt | ✅ | Short-term window + long-term retrieved memory |
| 2.10 | Algorithm verification suite | ✅ | `npm test` runs 17/17 automated checks (100% pass) |

---

## Phase 3 — Polish, Citations & DESIGN.md

**Goal**: Production-quality UX, inline citations, DESIGN.md, and repo ready to submit.

**Status**: 🟢 Complete

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.1 | Implement inline citation extraction | ✅ | Extracts URLs and domains from responses |
| 3.2 | Render source cards in UI with favicons | ✅ | `SourceCard.tsx` shows title, domain, favicon |
| 3.3 | Copy-to-clipboard on assistant responses | ✅ | Icon button with feedback state |
| 3.4 | Multi-line textarea auto-resizing | ✅ | Shift+Enter support, dynamic height expansion |
| 3.5 | Write comprehensive `DESIGN.md` | ✅ | One-page architecture, trade-offs, 1-week plan |
| 3.6 | Technical documentation (`DOCUMENTATION.md`) | ✅ | In-depth algorithm justifications |
| 3.7 | Technical report (`REPORT.md`) | ✅ | Updated with Phase 1 & 2 performance metrics |
| 3.8 | Comprehensive `README.md` | ✅ | Diagrams, setup guide, architecture flow |
| 3.9 | Automated unit test suite (`npm test`) | ✅ | Verified with Node 22 |
