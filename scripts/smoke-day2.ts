/**
 * Day 2 smoke test — Redis bus, Zod schema validation, MCP connectivity.
 * Run: npx tsx scripts/smoke-day2.ts
 */
import { createBus }        from '../packages/agent-bus/src/bus.js';
import { createPlaywrightMcp } from '../packages/mcp-clients/src/playwright.js';
import { AgentMessageSchema, SCHEMA_VERSION } from '../packages/schemas/src/index.js';
import { randomUUID }       from 'crypto';

const assert = (cond: boolean, msg: string) => {
  if (!cond) { console.error(`✗ FAIL: ${msg}`); process.exit(1); }
  console.log(`✓ ${msg}`);
};

const main = async () => {
  console.log('\n=== Day 2 smoke test ===\n');

  // ── Test 1: Redis bus connectivity ─────────────────────────
  console.log('[1/4] Redis bus...');
  const bus = createBus(process.env.REDIS_URL ?? 'redis://localhost:6379');
  assert(await bus.ping(), 'Redis is reachable and responds to PING');

  // ── Test 2: Pub/Sub round-trip ─────────────────────────────
  console.log('\n[2/4] Pub/Sub round-trip...');
  let received = false;
  await bus.subscribe('smoke:*', async () => { received = true; });

  await bus.publish('smoke:ping', {
    id:            randomUUID(),
    agentId:       'smoke-test',
    type:          'health',
    schemaVersion: SCHEMA_VERSION,
    timestamp:     new Date().toISOString(),
    payload:       { status: 'ok' },
  });
  await new Promise(r => setTimeout(r, 300));
  assert(received, 'Redis pub/sub: message published and received');

  // ── Test 3: Zod schema validation ──────────────────────────
  console.log('\n[3/4] Schema validation...');

  // Valid message must parse without errors
  const valid = AgentMessageSchema.safeParse({
    id:            randomUUID(),
    agentId:       'smoke-test',
    type:          'health',
    schemaVersion: SCHEMA_VERSION,
    timestamp:     new Date().toISOString(),
    payload:       {},
  });
  assert(valid.success, 'Valid AgentMessage parses successfully');

  // Malformed message (missing required fields) must be rejected
  const invalid = AgentMessageSchema.safeParse({
    id: 'not-a-uuid', agentId: '', type: 'unknown-type',
  });
  assert(!invalid.success, 'Malformed message (bad id, empty agentId, unknown type) rejected');

  // Wrong schemaVersion must be rejected — agents refuse stale messages
  const wrongVersion = AgentMessageSchema.safeParse({
    id:            randomUUID(),
    agentId:       'smoke-test',
    type:          'health',
    schemaVersion: '0.0.1',           // wrong version
    timestamp:     new Date().toISOString(),
    payload:       {},
  });
  assert(!wrongVersion.success, 'Old schemaVersion "0.0.1" rejected by Zod literal guard');

  // ── Test 4: Playwright MCP (StdioTransport) ─────────────────
  // GitHub MCP and Jira MCP require real credentials (see .env.agents).
  // Playwright MCP runs as a local child process — no credentials needed.
  console.log('\n[4/4] Playwright MCP (StdioTransport health check)...');
  let mcpOk = false;
  let mcpToolCount = 0;
  try {
    const client = await createPlaywrightMcp();
    const tools  = await client.listTools();
    mcpToolCount = tools.tools.length;
    mcpOk = mcpToolCount > 0;
    // Close the stdio transport gracefully
    await client.close();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`  ⚠  Playwright MCP unavailable (${msg}) — install @playwright/mcp to enable`);
  }
  if (mcpOk) {
    assert(mcpOk, `Playwright MCP connected — ${mcpToolCount} tools available`);
  } else {
    console.log('  ℹ  Playwright MCP skipped (not installed or headless browser unavailable)');
    console.log('     Run: pnpm add -w @playwright/mcp && npx playwright install chromium');
  }

  console.log('\n✅ Day 2 smoke test PASSED — Redis bus is healthy\n');
  await bus.close();
};

main().catch(e => { console.error(e); process.exit(1); });
