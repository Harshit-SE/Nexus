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

- Node.js 20+
- A [Google AI Studio](https://aistudio.google.com) API key (free)
- A [Brave Search API](https://api.search.brave.com) key (free tier: 2000 queries/month)

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/Harshit-SE/hiring_project.git
cd hiring_project

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your API keys

# 4. Verify algorithms
npm test

# 5. Run the development server
npm run dev

# 6. Open your browser
open http://localhost:3000
```

### Environment Variables

```env
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key_here
BRAVE_API_KEY=your_brave_search_api_key_here
```

---

## Key Features

### 🧠 Persistent Semantic Memory
Every conversation turn is embedded and indexed. Ask "what did I say last Tuesday?" and Nexus finds it — no matter how many conversations ago.

### 🔍 Real-Time Web Search
Live Brave Search integration with freshness control. Nexus knows today's pricing, yesterday's announcements, and this morning's news.

### ⚡ Parallel Multi-Entity Search
"Check all 5 CRM tools" runs 5 searches in parallel — not sequentially. Fast answers on complex queries.

### 📅 Temporal Reasoning
Natural language date understanding ("last Monday", "3 November", "since the meeting"). Knows when to search vs when to recall.

### 🔗 Cited Answers
Every factual claim comes with a source URL. See exactly where the information came from.

### ♻️ Freshness Verification
"Is my answer still correct?" — Nexus re-searches and explicitly tells you what's changed and what hasn't.

---

## Project Structure

```
nexus-agent/
├── app/
│   ├── api/chat/route.ts     ← ReAct agent endpoint (streaming)
│   ├── page.tsx              ← Chat UI
│   └── layout.tsx
├── lib/
│   ├── agent/
│   │   ├── loop.ts           ← ReAct orchestration
│   │   ├── tools.ts          ← web_search tool definition
│   │   └── temporal.ts       ← intent detection + date parsing
│   ├── memory/
│   │   ├── store.ts          ← vectra index + JSON persistence
│   │   ├── retrieval.ts      ← semantic + date-keyed retrieval
│   │   └── embeddings.ts     ← Gemini embedding calls
│   ├── search/
│   │   ├── brave.ts          ← Brave API wrapper
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
