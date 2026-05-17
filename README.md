# Autonomous QA Pipeline

A 30-day autonomous test automation pipeline built with **Playwright**, **TypeScript**, and **AI agents** powered by **Google Gemini 2.0 Flash** (free tier).

## Architecture

```
11 specialized agents communicating via Redis pub/sub
         ┌─────────────────────────────────┐
         │         Orchestrator Agent       │
         └────────────┬────────────────────┘
                      │ Redis pub/sub
        ┌─────────────┼──────────────┐
        ▼             ▼              ▼
Requirements     Test Generator   Executor
   Agent            Agent          Agent
(Jira → Gherkin) (Gherkin→PW)  (Playwright)
        │
        ▼
   ChromaDB
(vector store)
```

**Key technology choices:**
- **LLM:** Google Gemini 2.0 Flash via OpenAI-compatible API (free, no credit card)
- **Embeddings:** `gemini-embedding-001` via native Gemini REST API
- **Agent bus:** Redis 7 pub/sub with Zod-validated message contracts
- **MCP servers:** Playwright, GitHub, Jira, Slack (Model Context Protocol)
- **Vector store:** ChromaDB v3 with cosine similarity search
- **Monorepo:** pnpm workspaces + Turborepo (6 packages)

## Prerequisites

| Tool | Version | Download |
|------|---------|----------|
| Node.js | 20+ | https://nodejs.org |
| pnpm | 9+ | `npm i -g pnpm` |
| Docker Desktop | latest | https://docker.com/products/docker-desktop |

## Quick Start

### 1. Clone the repo
```bash
git clone https://github.com/praveen28488/autonomous-qa-pipeline.git
cd autonomous-qa-pipeline
```

### 2. Install dependencies
```bash
pnpm install
```

### 3. Set your Gemini API key
Create a file called `.env.local` in the project root:
```
GEMINI_API_KEY=your_key_here
```
Get a free key at: https://aistudio.google.com/apikey

### 4. Run the full test suite (one command)
```powershell
# Windows (PowerShell)
.\run-tests.ps1
```
```bash
# Mac / Linux
bash run-tests.sh
```

This single command:
- Starts Redis + ChromaDB via Docker
- Runs Day 2 smoke test (Redis bus + Zod schemas + Playwright MCP)
- Runs Day 3 smoke test (ChromaDB + Requirements Agent + semantic search)
- Runs Playwright browser tests

### 5. View the test report
```bash
npx playwright show-report
```

## Project Structure

```
autonomous-qa-pipeline/
├── apps/
│   └── requirements-agent/     # Day 3: Jira → Gherkin AI agent
│       └── src/
│           ├── agent.ts         # Agentic loop (think → act → emit)
│           ├── chroma-store.ts  # ChromaDB v3 + Gemini embeddings
│           └── index.ts         # Entry point
├── packages/
│   ├── schemas/                 # Zod schemas for all agent messages
│   ├── agent-bus/               # Redis pub/sub bus + BaseAgent
│   ├── mcp-clients/             # MCP server wrappers
│   └── config/                  # Shared env config
├── tests/
│   └── generated/
│       └── smoke.spec.ts        # Playwright browser tests
├── scripts/
│   ├── smoke-day2.ts            # Day 2 smoke test
│   └── smoke-day3.ts            # Day 3 smoke test
├── infra/docker/
│   └── docker-compose.yml       # Redis + ChromaDB containers
├── run-tests.ps1                # One-click test runner (Windows)
├── run-tests.sh                 # One-click test runner (Mac/Linux)
└── test-scenarios.json          # Generated test scenarios output
```

## Day-by-Day Implementation

### Day 1 — Environment Bootstrap
- pnpm monorepo with Turborepo
- TypeScript strict mode across all packages
- Playwright configured with POM pattern
- Docker Compose for Redis + ChromaDB
- GitHub Actions CI pipeline

### Day 2 — MCP Agent Bus
- Redis 7 pub/sub message bus (`@qa/agent-bus`)
- Zod schemas for all inter-agent messages (`@qa/schemas`)
- MCP server wrappers for Playwright, GitHub, Jira, Slack (`@qa/mcp-clients`)
- BaseAgent with agentic loop (think → act → emit)
- Schema validation at bus boundary (malformed messages rejected)

### Day 3 — Requirements Agent + ChromaDB
- Requirements Agent ingests Jira stories (or mock data if Jira not configured)
- Scores acceptance criteria quality (ingest / ingest_with_warning / skip)
- Generates Gherkin scenarios via Gemini 2.0 Flash
- Stores scenarios in ChromaDB with semantic embeddings
- Quality gate: skips stories below threshold
- Semantic search across stored scenarios

## Running Individual Components

```bash
# Build all packages
pnpm build

# TypeScript check
pnpm typecheck

# Day 2 smoke test only
npx tsx scripts/smoke-day2.ts

# Day 3 smoke test only
npx tsx scripts/smoke-day3.ts

# Run Requirements Agent standalone
RUN_IMMEDIATELY=true npx tsx apps/requirements-agent/src/index.ts

# Playwright UI mode
npx playwright test --ui
```

## Infrastructure

| Service | URL | Purpose |
|---------|-----|---------|
| Redis 7 | localhost:6379 | Agent message bus |
| ChromaDB | localhost:8000 | Vector store for test scenarios |

```bash
# Start infrastructure
docker compose -f infra/docker/docker-compose.yml up -d

# Stop infrastructure
docker compose -f infra/docker/docker-compose.yml down
```

## CI/CD

GitHub Actions runs on every push to `main`, `staging`, `dev`:
- **Build job:** `pnpm build` + `pnpm typecheck` (zero TypeScript errors)
- **Smoke test job:** Playwright browser tests with Chromium

Required GitHub secret: `GEMINI_API_KEY`

## Agent Message Schema

All inter-agent messages are validated at the bus boundary using Zod:

```typescript
AgentMessageSchema = {
  id: UUID,
  schemaVersion: "1.0.0",
  type: "heartbeat" | "trigger" | "result" | "error",
  source: string,
  target: string,
  payload: object,
  timestamp: ISO8601
}
```

## License

MIT
