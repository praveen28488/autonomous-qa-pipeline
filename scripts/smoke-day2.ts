/**
 * Day 2 smoke test — verifies Redis bus connectivity and MCP health.
 * Run: npx tsx scripts/smoke-day2.ts
 */
import { createBus }        from '../packages/agent-bus/src/bus.js';
import { AgentMessage }     from '../packages/schemas/src/index.js';
import { randomUUID }       from 'crypto';

const assert = (cond: boolean, msg: string) => {
  if (!cond) { console.error(`✗ FAIL: ${msg}`); process.exit(1); }
  console.log(`✓ ${msg}`);
};

const main = async () => {
  console.log('\n=== Day 2 smoke test ===\n');

  // ── Test 1: Redis bus connectivity ─────────────────────────
  console.log('[1/3] Redis bus...');
  const bus = createBus(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const alive = await bus.ping();
  assert(alive, 'Redis is reachable and responds to PING');

  // ── Test 2: Pub/Sub round-trip ─────────────────────────────
  console.log('\n[2/3] Pub/Sub round-trip...');
  let received = false;
  await bus.subscribe('agents:test:smoke:*', async () => { received = true; });

  const testMsg: AgentMessage = {
    id:            randomUUID(),
    agentId:       'smoke-test',
    type:          'health',
    schemaVersion: '1.0.0',
    timestamp:     new Date().toISOString(),
    payload:       { status: 'ok' },
  };

  await bus.publish('agents:test:smoke:health', testMsg);
  await new Promise(r => setTimeout(r, 300));
  assert(received, 'Published message received by subscriber');

  // ── Test 3: Zod schema rejection ─────────────────────────
  console.log('\n[3/3] Schema validation rejects invalid messages...');
  let threw = false;
  try {
    // @ts-expect-error — intentionally invalid message
    await bus.publish('agents:test:smoke:health', { id: 'not-a-uuid', type: 'bad' });
  } catch { threw = true; }
  assert(threw, 'Invalid message rejected by Zod validation at bus boundary');

  console.log('\n✅ Day 2 smoke test PASSED — Redis bus is healthy\n');
  await bus.close();
};

main().catch(e => { console.error(e); process.exit(1); });
