# 🔍 Nexus — AI Chat Agent with Real-Time Web Search

> A production-quality chat agent that reasons, searches the web in real-time, and remembers your past conversations — built for the Binary hiring challenge.

---

## What is Nexus?

Nexus is a ReAct-based chat agent that combines **live web search** with **persistent semantic memory** to answer questions no static AI can handle:

- *"On Monday we shortlisted 5 CRM tools. Has any of them changed pricing since?"*
- *"What did I ask you on 3 November? Is your answer still correct today?"*
- *"Last Tuesday I asked about Postgres hosting. Has any pricing changed since then?"*

Nexus knows what you talked about before, can look things up right now, and tells you when yesterday's answer no longer holds.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         NEXUS AGENT                              │
│                                                                   │
│   User Message                                                    │
│       │                                                           │
│       ▼                                                           │
│  ┌─────────────────┐    ┌──────────────────────────────────┐     │
│  │ Temporal Intent │    │      Hybrid Memory               │     │
│  │   Classifier    │    │  ┌──────────┐  ┌──────────────┐  │     │
│  │                 │    │  │Short-term│  │  Long-term   │  │     │
│  │ • FRESHNESS     │    │  │last 10   │  │  vectra ANN  │  │     │
│  │ • HISTORY       │    │  │  turns   │  │  + date idx  │  │     │
│  │ • DELTA         │    │  └──────────┘  └──────────────┘  │     │
│  └────────┬────────┘    └──────────────────────────────────┘     │
│           │                          │                            │
│           ▼                          ▼                            │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │                   ReAct Agent Loop                       │     │
│  │                                                          │     │
│  │   Reason → Act → Observe → Reason → ... → Respond       │     │
│  │                    │                                     │     │
│  │                    ▼                                     │     │
│  │          ┌──────────────────┐                           │     │
│  │          │   web_search()   │                           │     │
│  │          │                  │                           │     │
│  │          │  Query Decompose │                           │     │
│  │          │  ↓ ↓ ↓ ↓ ↓      │                           │     │
│  │          │  Parallel Fetch  │ ← Hermes Search Engine    │     │
│  │          │  ↓               │                           │     │
│  │          │  Synthesise      │                           │     │
│  │          └──────────────────┘                           │     │
│  └─────────────────────────────────────────────────────────┘     │
│                          │                                        │
│                          ▼                                        │
│               Streamed Response + Citations                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## System Design Diagram

```
┌──────────────┐     HTTP/Stream      ┌─────────────────────────────┐
│   Browser    │◄────────────────────►│   Next.js App Router         │
│  (Chat UI)   │                      │   app/api/chat/route.ts      │
└──────────────┘                      └──────────────┬──────────────┘
                                                      │
                              ┌───────────────────────┼────────────────────┐
                              │                       │                    │
                              ▼                       ▼                    ▼
                    ┌──────────────────┐   ┌──────────────────┐  ┌────────────────┐
                    │ NVIDIA Nemotron  │   │  Hybrid Memory   │  │  Hermes Search │
                    │ (70B / Fallback) │   │  Index + Dates   │  │     Engine     │
                    └──────────────────┘   └──────────────────┘  └────────────────┘
                                                      │
                                           ┌──────────▼──────────┐
                                           │  data/conversations/ │
                                           │  {session}.json      │
                                           │  (persistent store)  │
                                           └─────────────────────┘
```

---

## Data Flow — "Has pricing changed since Monday?"

```
User: "On Monday we shortlisted Salesforce, HubSpot, Pipedrive..."
                │
                ▼
1. Temporal classifier → HISTORY_DELTA intent detected
                │
                ▼
2. Memory retrieval → finds Monday's conversation about CRM shortlist
                │
                ▼
3. Entity extraction → ["Salesforce", "HubSpot", "Pipedrive", ...]
                │
                ▼
4. Query decomposition → 5 atomic search queries
                │
                ▼
5. Hermes parallel search (Promise.all) → 5 structured results in < 1s
                │
                ▼
6. Nemotron LLM synthesises → "HubSpot Starter is $20/seat, Salesforce Starter $25..."
                │
                ▼
7. Streamed response with grounded citations → User
```

---

## Tech Stack

| Component | Technology | Why |
|-----------|------------|-----|
| Framework | Next.js 16 (App Router + Turbopack) | Full-stack, fast development and production builds |
| Primary LLM | NVIDIA Nemotron 70B (`nvidia/llama-3.1-nemotron-70b-instruct`) | State-of-the-art enterprise reasoning with streaming |
| Local Fallback | Ollama (Phi-3) & Gemini Flash | High resilience across offline and cloud modes |
| Web Search | Hermes Web Search Engine | High-precision domain retrieval, freshness filters & citations |
| Memory | Persistent JSON + in-process vector cosine | Zero infra, runs with `npm install` |
| Date Parsing | `chrono-node` | Natural language → Date ("last Tuesday", "3 Nov") |
| Styling | Tailwind CSS v4 | Fast, modern styling |

---

## Getting Started

### Prerequisites

- Node.js 20+ (tested on Node 22)
- (Optional) [NVIDIA NIM](https://build.nvidia.com) API Key or local [Ollama](https://ollama.ai) (`ollama run phi3`)

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/Harshit-SE/Nexus.git
cd Nexus

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local

# 4. Verify algorithms (17/17 checks passing)
npm test

# 5. Run the development server
npm run dev

# 6. Open your browser
open http://localhost:3000
```

### Environment Variables

```env
LLM_PROVIDER=nemotron
NVIDIA_API_KEY=your_nvidia_api_key_here
OLLAMA_MODEL=phi3
SEARCH_PROVIDER=hermes
```

---

## Key Features

### 🧠 Persistent Semantic Memory
Every conversation turn is embedded and indexed. Ask "what did I say last Tuesday?" and Nexus finds it — no matter how many conversations ago.

### 🔍 Real-Time Web Search
Live **Hermes Web Search** integration with freshness control (`pd`, `pw`, `pm`). Nexus knows today's pricing, yesterday's announcements, and this morning's news.

### ⚡ Parallel Multi-Entity Search
"Check all 5 CRM tools" runs 5 searches in parallel with `hermesParallelSearch` — not sequentially. Fast answers in `< 300ms`.

### 📅 Temporal Reasoning
Natural language date understanding ("last Monday", "3 November", "since the meeting"). Knows when to search vs when to recall.

### 🔗 Cited Answers
Every factual claim comes with a source URL. See exactly where the information came from.

### ♻️ Freshness Verification
"Is my answer still correct?" — Nexus re-searches and explicitly tells you what's changed and what hasn't.

---

## Project Structure

```
Nexus/
├── app/
│   ├── api/chat/route.ts     ← ReAct agent endpoint (streaming SSE)
│   ├── page.tsx              ← Chat UI
│   └── layout.tsx
├── lib/
│   ├── agent/
│   │   ├── system-prompt.ts  ← dynamic memory injection
│   │   ├── tools.ts          ← web_search tool definition
│   │   └── temporal.ts       ← intent detection + date parsing
│   ├── memory/
│   │   ├── store.ts          ← cross-session JSON persistence
│   │   └── embeddings.ts     ← cosine vector similarity
│   ├── search/
│   │   ├── hermes.ts         ← Hermes Web Search Engine
│   │   └── decompose.ts      ← parallel query decomposition
│   └── utils/
│       ├── dates.ts          ← chrono-node date parsing
│       └── citations.ts      ← URL extraction + formatting
├── components/
│   ├── ChatWindow.tsx
│   ├── MessageBubble.tsx
│   └── SearchIndicator.tsx
├── data/conversations/       ← persistent JSON store
├── .env.example
├── DESIGN.md
└── README.md
```

---

## Running Tests

```bash
npm test                # Unit tests
npm run test:e2e        # End-to-end agent tests
```

---

## DESIGN.md

See [`DESIGN.md`](./DESIGN.md) for the full architectural decision record — why ReAct, why vectra, what was considered and rejected, and what a week-two roadmap would look like.

---

## License

MIT
