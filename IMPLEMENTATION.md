# Implementation Guide — Autonomous QA Pipeline

A complete technical reference for how this project was built,
every architectural decision made, and how to replicate it.

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Day 1 — Bootstrap](#2-day-1--bootstrap)
3. [Day 2 — Agent Bus + MCP](#3-day-2--agent-bus--mcp)
4. [Day 3 — Requirements Agent + RAG](#4-day-3--requirements-agent--rag)
5. [Key Architectural Decisions](#5-key-architectural-decisions)
6. [Gotchas and Fixes](#6-gotchas-and-fixes)
7. [How to Replicate This Project](#7-how-to-replicate-this-project)

---

## 1. Project Structure

```
autonomous-qa-pipeline/
├── apps/
│   ├── requirements-agent/         # Day 3: AI agent (Jira → Gherkin → ChromaDB)
│   │   └── src/
│   │       ├── agent.ts            # RequirementsAgent with all tool handlers
│   │       ├── chroma-store.ts     # ChromaDB v3 + Gemini embeddings
│   │       ├── quality-gate.ts     # Acceptance criteria scoring logic
│   │       ├── tools.ts            # OpenAI function-call tool definitions
│   │       ├── mock-jira.ts        # Mock stories when Jira not configured
│   │       └── index.ts            # Entry point (RUN_IMMEDIATELY or wait for trigger)
│   └── orchestrator/               # Orchestrates all agents via Redis
├── packages/
│   ├── schemas/                    # Zod schemas for ALL agent messages
│   │   └── src/
│   │       ├── messages.ts         # AgentMessage, TestScenario, RequirementsOutput, etc.
│   │       └── index.ts
│   ├── agent-bus/                  # Redis pub/sub + BaseAgent agentic loop
│   │   └── src/
│   │       ├── bus.ts              # createBus(), publish(), subscribe()
│   │       ├── base-agent.ts       # BaseAgent class with run(), executeTool(), emitNode()
│   │       └── index.ts
│   ├── mcp-clients/                # MCP server wrappers
│   │   └── src/
│   │       ├── playwright.ts       # StdioTransport MCP client
│   │       ├── github.ts           # SSETransport MCP client
│   │       ├── jira.ts             # SSETransport MCP client
│   │       ├── slack.ts            # StdioTransport MCP client
│   │       └── index.ts            # createMcpRegistry()
│   └── config/                     # Shared env config
├── tests/
│   └── generated/
│       └── smoke.spec.ts           # Playwright browser tests
├── scripts/
│   ├── smoke-day2.ts               # Day 2 verification script
│   └── smoke-day3.ts               # Day 3 verification script
├── infra/docker/
│   └── docker-compose.yml          # Redis 7 + ChromaDB containers
├── .github/workflows/
│   └── ci.yml                      # GitHub Actions CI pipeline
├── doppler.yaml                    # Doppler secrets manager config
├── run-tests.ps1                   # One-click test runner (Windows)
├── run-tests.sh                    # One-click test runner (Mac/Linux)
├── test-scenarios.json             # Generated output from Requirements Agent
└── .env.local                      # Local secrets (gitignored, never committed)
```

---

## 2. Day 1 — Bootstrap

### 2.1 pnpm Monorepo Setup

```bash
mkdir autonomous-qa-pipeline && cd autonomous-qa-pipeline
pnpm init
```

**`pnpm-workspace.yaml`:**
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**`turbo.json`:**
```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["build"] }
  }
}
```

Each package has its own `tsconfig.json` with `strict: true` and `package.json` with `"build": "tsc"`.

### 2.2 Docker Compose (Redis + ChromaDB)

```yaml
# infra/docker/docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    container_name: qa-redis
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  chromadb:
    image: chromadb/chroma:latest
    container_name: qa-chromadb
    ports: ["8000:8000"]
    healthcheck:
      # NOTE: curl is NOT installed in ChromaDB container.
      # Use TCP bash probe instead.
      test: ["CMD", "bash", "-c", "echo > /dev/tcp/localhost/8000"]
      interval: 10s
      timeout: 5s
      retries: 5
```

### 2.3 GitHub Actions CI

```yaml
# .github/workflows/ci.yml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm typecheck

  test-smoke:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test tests/generated/smoke.spec.ts --project=chromium
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

### 2.4 Playwright Config

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './tests/generated',
  use: { baseURL: 'https://example.com', headless: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: [['html'], ['list']],
});
```

**Page Object Model pattern:**
```typescript
// pages/ExamplePage.ts
export class ExamplePage {
  constructor(private page: Page) {}
  async goto() { await this.page.goto('/'); }
  async getTitle() { return this.page.title(); }
}
```

---

## 3. Day 2 — Agent Bus + MCP

### 3.1 Zod Message Schema

All inter-agent messages must pass this schema before being published to Redis:

```typescript
// packages/schemas/src/messages.ts
export const SCHEMA_VERSION = '1.0.0';

export const AgentMessageSchema = z.object({
  id:            z.string().uuid(),
  schemaVersion: z.literal('1.0.0'),
  type:          z.enum(['heartbeat', 'trigger', 'result', 'error', 'done']),
  source:        z.string().min(1),
  target:        z.string().min(1),
  payload:       z.record(z.unknown()),
  timestamp:     z.string().datetime(),
});

export const TestScenarioSchema = z.object({
  id:           z.string().uuid(),
  jiraStoryId:  z.string(),
  title:        z.string(),
  gherkin:      z.string(),
  tags:         z.array(z.string()),
  priority:     z.enum(['critical', 'high', 'medium', 'low']),
  sourceType:   z.enum(['jira', 'confluence', 'pdf', 'manual']),
  qualityScore: z.number().min(0).max(100),
  generatedAt:  z.string().datetime(),
  rawAC:        z.string().optional(),
});
```

### 3.2 Redis Bus

```typescript
// packages/agent-bus/src/bus.ts
import Redis from 'ioredis';

export const createBus = (redisUrl?: string) => {
  const pub = new Redis(redisUrl ?? 'redis://localhost:6379');
  const sub = new Redis(redisUrl ?? 'redis://localhost:6379');

  return {
    publish: async (channel: string, msg: AgentMessage) => {
      AgentMessageSchema.parse(msg); // validate before publish
      await pub.publish(channel, JSON.stringify(msg));
    },
    subscribe: async (channel: string, handler: (msg: AgentMessage) => Promise<void>) => {
      await sub.subscribe(channel);
      sub.on('message', async (ch, raw) => {
        if (ch !== channel) return;
        const msg = AgentMessageSchema.parse(JSON.parse(raw));
        await handler(msg);
      });
    },
    quit: async () => { await pub.quit(); await sub.quit(); },
  };
};
```

### 3.3 BaseAgent with Agentic Loop

```typescript
// packages/agent-bus/src/base-agent.ts
export abstract class BaseAgent {
  protected cfg: AgentConfig;
  private gemini: OpenAI;

  constructor(cfg: AgentConfig) {
    this.cfg = cfg;
    this.gemini = new OpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    });
  }

  async run(userPrompt: string): Promise<void> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: this.cfg.systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    // Agentic loop: think → act → repeat
    while (true) {
      const response = await this.gemini.chat.completions.create({
        model: 'gemini-2.0-flash',
        messages,
        tools: this.cfg.tools,
      });

      const choice = response.choices[0];

      if (choice.finish_reason === 'stop') {
        await this.emitNode(messages);
        break;
      }

      // Execute all tool calls
      messages.push(choice.message);
      for (const toolCall of choice.message.tool_calls ?? []) {
        const result = await this.executeTool(
          toolCall.function.name,
          JSON.parse(toolCall.function.arguments)
        );
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }
  }

  protected abstract executeTool(name: string, input: unknown): Promise<unknown>;
  protected abstract emitNode(state: unknown): Promise<void>;
}
```

### 3.4 MCP Clients

```typescript
// Playwright MCP (StdioTransport)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['@playwright/mcp@latest'],
});
const client = new Client({ name: 'qa-pipeline', version: '1.0.0' });
await client.connect(transport);

// GitHub/Jira MCP (SSETransport)
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const transport = new SSEClientTransport(new URL('http://localhost:8811/sse'));
await client.connect(transport);
```

---

## 4. Day 3 — Requirements Agent + RAG

### 4.1 ChromaDB v3 with Gemini Embeddings

**Critical:** ChromaDB v3 removed the default local embedding fallback.
You MUST implement the `EmbeddingFunction` interface.

```typescript
// apps/requirements-agent/src/chroma-store.ts
import { ChromaClient, EmbeddingFunction } from 'chromadb';

class GeminiEmbeddingFunction implements EmbeddingFunction {
  private apiKey = process.env.GEMINI_API_KEY ?? '';

  async generate(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(async (text) => {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: { parts: [{ text }] },
            taskType: 'SEMANTIC_SIMILARITY',
          }),
        }
      );
      const data = await res.json();
      return data.embedding.values; // 768-dimensional vector
    }));
  }
}

export class ChromaStore {
  private client = new ChromaClient({ host: 'localhost', port: 8000 });
  private embedFn = new GeminiEmbeddingFunction();
  private collection = null;

  async connect() {
    this.collection = await this.client.getOrCreateCollection({
      name: 'test-scenarios',
      embeddingFunction: this.embedFn,
      metadata: { 'hnsw:space': 'cosine' }, // cosine similarity
    });
  }

  async addScenarios(scenarios) {
    await this.collection.upsert({
      ids:       scenarios.map(s => s.id),
      documents: scenarios.map(s => `${s.title}\n\n${s.gherkin}`),
      metadatas: scenarios.map(s => ({ jiraStoryId: s.jiraStoryId, ... })),
    });
  }

  async search(query: string, topK = 5) {
    return this.collection.query({ queryTexts: [query], nResults: topK });
  }

  async reset() {
    await this.client.deleteCollection({ name: 'test-scenarios' }); // must be object
    await this.connect();
  }
}
```

### 4.2 RAG Pattern

The RAG (Retrieval-Augmented Generation) loop:

```
For each Jira story:
  1. score_requirements_quality()          → get recommendation
  2. If ingest/ingest_with_warning:
     a. search_similar_scenarios(query)    → RETRIEVE from ChromaDB
     b. Use retrieved scenarios as context → AUGMENT the prompt
     c. generate_test_scenario()           → GENERATE with context
```

The system prompt enforces step (a) before every generation:
```
ALWAYS call search_similar_scenarios before generate_test_scenario.
Use retrieved scenarios as examples to generate better, non-duplicate scenarios.
```

### 4.3 Quality Gate

```typescript
// apps/requirements-agent/src/quality-gate.ts
export function scoreRequirementsQuality(input) {
  let score = 0;
  const missingFields = [];

  if (input.title?.length > 10) score += 20;
  else missingFields.push('title too short');

  if (input.acceptanceCriteria?.length > 50) score += 40;
  else missingFields.push('acceptance criteria too short');

  const hasGherkin = /given|when|then/i.test(input.acceptanceCriteria ?? '');
  if (hasGherkin) score += 30;
  else missingFields.push('no Gherkin keywords');

  if (input.description?.length > 20) score += 10;

  return {
    overall: score,
    missingFields,
    recommendation: score >= 60 ? 'ingest'
                  : score >= 40 ? 'ingest_with_warning'
                  : 'skip',
  };
}
```

### 4.4 PDF Ingestion

```typescript
import pdfParse from 'pdf-parse';
import { readFile } from 'fs/promises';

case 'parse_prd_pdf': {
  const buffer = await readFile(join(process.cwd(), filePath));
  const parsed = await pdfParse(buffer);
  // Returns { text, numpages } — feed text into agent as requirements context
  return { text: parsed.text, pages: parsed.numpages };
}
```

### 4.5 Done Signal (Bus)

After all scenarios are generated and stored, publish to Redis:

```typescript
await this.cfg.bus.publish('agents:requirements:orchestrator:done', {
  id:            randomUUID(),
  schemaVersion: '1.0.0',
  type:          'done',
  source:        'requirements',
  target:        'orchestrator',
  timestamp:     new Date().toISOString(),
  payload:       { totalIngested, totalSkipped, scenarios },
});
```

---

## 5. Key Architectural Decisions

### 5.1 Gemini instead of Anthropic Claude

| Factor | Decision |
|--------|----------|
| Cost | Gemini free tier vs Claude paid |
| API compat | Both support OpenAI function-calling format |
| Embeddings | Gemini: native REST API. Claude: no embeddings |
| Result | Identical agentic loop, zero cost |

### 5.2 Custom agentic loop instead of LangGraph

LangGraph requires Anthropic/OpenAI SDK streaming format and is incompatible
with Gemini's API. The custom `while(true)` loop implements the identical pattern:

```
LangGraph:    Node → Edge → Node → Edge → END
Custom loop:  think → tool_call → observe → think → ... → stop
```

### 5.3 ChromaDB for vector storage

- v3 API requires explicit `EmbeddingFunction` (no default fallback)
- `deleteCollection()` takes `{ name: string }` object (not a plain string)
- Health check must use TCP bash probe (curl not installed in container)
- cosine similarity (`hnsw:space: cosine`) for semantic search

### 5.4 Secrets management

```
Priority order:
1. Doppler (production) — doppler run -- <command>
2. .env.local (local dev) — loaded by run-tests.ps1 / run-tests.sh
3. GitHub Actions secrets — ${{ secrets.GEMINI_API_KEY }}
Never: hardcode in source code
```

---

## 6. Gotchas and Fixes

| Problem | Cause | Fix |
|---------|-------|-----|
| ChromaDB "unhealthy" | curl not in container | TCP bash probe: `echo > /dev/tcp/localhost/8000` |
| Embeddings 404 | OpenAI compat doesn't proxy embeddings | Call native Gemini REST API directly |
| `text-embedding-004` not found | Model unavailable on free tier | Use `gemini-embedding-001` instead |
| `deleteCollection(string)` error | v3 API changed | Use `deleteCollection({ name: string })` |
| GEMINI_API_KEY not passed to Node | WSL→Windows process boundary | Use PowerShell `$env:VAR =` not bash `export` |
| `@playwright/test` not found | Missing workspace dep | `pnpm add -w @playwright/test` |
| Gemini 429 rate limit | Free tier RPM limit | Add delay between API calls or pre-generate output |
| `version` attribute warning | Obsolete docker-compose field | Remove `version:` from docker-compose.yml |

---

## 7. How to Replicate This Project

### Step 1 — Scaffold
```bash
mkdir my-qa-pipeline && cd my-qa-pipeline
pnpm init
echo "packages:\n  - 'apps/*'\n  - 'packages/*'" > pnpm-workspace.yaml
pnpm add -w -D typescript turbo @types/node
```

### Step 2 — Create packages
```bash
mkdir -p packages/{schemas,agent-bus,mcp-clients,config}/src
mkdir -p apps/{requirements-agent,orchestrator}/src
mkdir -p tests/generated scripts infra/docker .github/workflows
```

### Step 3 — Install core dependencies
```bash
# Agent bus
pnpm add -w ioredis openai zod

# MCP
pnpm add -w @modelcontextprotocol/sdk

# ChromaDB
pnpm add -w chromadb

# PDF parsing
pnpm add -w pdf-parse
pnpm add -w -D @types/pdf-parse

# Playwright
pnpm add -w -D @playwright/test
npx playwright install chromium
```

### Step 4 — Build infrastructure
```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

### Step 5 — Set secrets
```bash
echo "GEMINI_API_KEY=your_key" > .env.local
echo ".env.local" >> .gitignore
```

### Step 6 — Implement in order
1. `packages/schemas` — Zod schemas first (everything depends on these)
2. `packages/agent-bus` — BaseAgent + Redis bus
3. `packages/mcp-clients` — MCP wrappers
4. `apps/requirements-agent` — quality-gate → chroma-store → tools → agent → index
5. `scripts/smoke-day2.ts` — verify bus works
6. `scripts/smoke-day3.ts` — verify agent + ChromaDB works
7. `tests/generated/smoke.spec.ts` — Playwright tests
8. `run-tests.ps1` — one-click runner

### Step 7 — Push to GitHub
```bash
git init
git add .
git commit -m "feat: initial implementation"
git remote add origin https://github.com/USERNAME/REPO.git
git push origin main
git checkout -b staging && git push origin staging
git checkout -b dev && git push origin dev
```

### Step 8 — Add GitHub secret
Go to: `https://github.com/USERNAME/REPO/settings/secrets/actions/new`
Add: `GEMINI_API_KEY` = your key

---

## Key Commands Reference

```bash
pnpm build                          # Build all packages
pnpm typecheck                      # TypeScript check
npx tsx scripts/smoke-day2.ts       # Test Redis + MCP
npx tsx scripts/smoke-day3.ts       # Test ChromaDB + agent
.\run-tests.ps1                     # Full suite (Windows)
bash run-tests.sh                   # Full suite (Mac/Linux)
npx playwright show-report          # View test report
RUN_IMMEDIATELY=true npx tsx apps/requirements-agent/src/index.ts
docker compose -f infra/docker/docker-compose.yml up -d
docker compose -f infra/docker/docker-compose.yml down
```
