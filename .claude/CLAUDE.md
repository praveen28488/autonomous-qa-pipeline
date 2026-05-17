# Autonomous QA Pipeline

## Project overview
30-day autonomous test automation pipeline using Playwright,
TypeScript, and Claude AI agents.

## Architecture
- 11 specialized agents communicating via Redis pub/sub
- All agents are TypeScript, built with LangGraph + Anthropic SDK
- Shared schemas in packages/schemas (Zod)
- Playwright tests live in tests/generated/

## Coding standards
- TypeScript strict mode always
- All inter-agent messages must match AgentMessageSchema
- Tests follow POM pattern: page objects in pages/, specs in tests/generated/
- No hardcoded waits (page.waitForTimeout) — use locator assertions

## Key packages
- @qa/schemas — Zod schemas for all agent contracts
- @qa/agent-bus — Redis pub/sub bus client + LangGraph BaseAgent
- @qa/mcp-clients — MCP server wrappers (Playwright, GitHub, Jira, Slack)
- @qa/config — shared env config

## Commands
- pnpm build — build all packages
- pnpm typecheck — TypeScript check across all packages
- pnpm test — run Playwright tests
- npx playwright test -- --ui — open Playwright UI mode
- npx tsx scripts/smoke-day2.ts — verify bus + MCP health
- npx tsx scripts/smoke-day3.ts — verify Requirements Agent + ChromaDB
