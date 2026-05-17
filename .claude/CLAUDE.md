# Autonomous QA Pipeline

## Project overview
30-day autonomous test automation pipeline using Playwright,
TypeScript, and AI agents powered by Google Gemini (free tier).

## Architecture
- 11 specialized agents communicating via Redis pub/sub
- Agents use Google Gemini 2.0 Flash via OpenAI-compatible API (free, no credit card)
- Agentic loop: think (Gemini) → act (tool calls) → repeat → emit done signal
- Shared Zod schemas in packages/schemas enforce message contracts at runtime
- Playwright tests live in tests/generated/

## LLM substitution note
The spec calls for @anthropic-ai/sdk + claude-sonnet-4-20250514.
This repo substitutes Google Gemini (gemini-2.0-flash) via the OpenAI-compatible
endpoint (https://generativelanguage.googleapis.com/v1beta/openai/) using the
openai npm package. Behavior is identical — same agentic loop, same tool-calling
interface. Set GEMINI_API_KEY to your free Gemini API key.

## Coding standards
- TypeScript strict mode always
- All inter-agent messages must match AgentMessageSchema (Zod-validated at bus boundary)
- Tests follow POM pattern: page objects in pages/, specs in tests/generated/
- No hardcoded waits (page.waitForTimeout) — use locator assertions

## Key packages
- @qa/schemas   — Zod schemas for all agent contracts (AgentMessage, TestScenario, etc.)
- @qa/agent-bus — Redis pub/sub bus client + BaseAgent (agentic loop)
- @qa/mcp-clients — MCP server wrappers (Playwright, GitHub, Jira, Slack)
- @qa/config    — shared env config

## Commands
- pnpm build                         — build all 6 packages (zero TS errors)
- pnpm typecheck                     — TypeScript check across all packages
- pnpm test                          — run Playwright tests
- npx playwright test -- --ui        — open Playwright UI mode
- npx tsx scripts/smoke-day2.ts      — verify Redis bus + MCP health
- npx tsx scripts/smoke-day3.ts      — verify Requirements Agent + ChromaDB
- RUN_IMMEDIATELY=true npx tsx apps/requirements-agent/src/index.ts  — run agent now

## Infrastructure (Docker)
- Redis 7       — localhost:6379  (agent message bus)
- ChromaDB      — localhost:8000  (vector store for test scenarios)
- GitHub MCP    — localhost:8811  (needs GITHUB_TOKEN)
- Jira MCP      — localhost:8812  (needs JIRA_URL, JIRA_USERNAME, JIRA_API_TOKEN)

Start: docker compose -f infra/docker/docker-compose.yml up -d
