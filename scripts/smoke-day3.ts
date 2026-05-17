/**
 * Day 3 smoke test — ChromaDB connectivity, quality gate, and Requirements Agent flow.
 * Run: npx tsx scripts/smoke-day3.ts
 */
import { ChromaStore }              from '../apps/requirements-agent/src/chroma-store.js';
import { scoreRequirementsQuality } from '../apps/requirements-agent/src/quality-gate.js';
import { createBus }                from '../packages/agent-bus/src/bus.js';
import { TestScenarioSchema }       from '../packages/schemas/src/index.js';
import { randomUUID }               from 'crypto';

const assert = (cond: boolean, msg: string) => {
  if (!cond) { console.error(`✗ FAIL: ${msg}`); process.exit(1); }
  console.log(`✓ ${msg}`);
};

const main = async () => {
  console.log('\n=== Day 3 smoke test ===\n');

  // ── Test 1: ChromaDB connectivity ─────────────────────────
  console.log('[1/4] ChromaDB...');
  const chroma = new ChromaStore(process.env.CHROMA_URL ?? 'http://localhost:8000');
  await chroma.connect();
  await chroma.reset();
  assert(await chroma.count() === 0, 'ChromaDB connected and empty after reset');

  // ── Test 2: Quality gate scoring ──────────────────────────
  console.log('\n[2/4] Quality gate...');
  const goodStory = scoreRequirementsQuality({
    jiraStoryId: 'QA-101',
    title: 'User can log in with valid credentials',
    acceptanceCriteria: `Given the user is on the login page
      When they enter a valid email and password
      Then they should be redirected to the dashboard
      And their name should be displayed in the header`,
    description: 'Standard login flow with email and password authentication',
  });
  assert(goodStory.recommendation === 'ingest', 'Good story: recommend ingest');
  assert(goodStory.overall >= 70,               'Good story: score >= 70');

  const badStory = scoreRequirementsQuality({
    jiraStoryId: 'QA-102',
    title: 'Story',
    acceptanceCriteria: 'it works',
  });
  assert(badStory.recommendation === 'skip', 'Bad story: recommend skip');
  assert(badStory.overall < 40,              'Bad story: score < 40');

  const warnStory = scoreRequirementsQuality({
    jiraStoryId: 'QA-103',
    title: 'User dashboard loads correctly',
    acceptanceCriteria: 'The dashboard should display user data and must load within 3 seconds',
  });
  assert(warnStory.recommendation === 'ingest_with_warning', 'Partial story: ingest_with_warning');

  // ── Test 3: ChromaDB upsert + semantic search ─────────────
  console.log('\n[3/4] ChromaDB upsert + semantic search...');
  const testScenario = TestScenarioSchema.parse({
    id:           randomUUID(),
    jiraStoryId:  'QA-101',
    title:        'User login with valid credentials',
    gherkin:      'Feature: Login\n  Scenario: Successful login\n    Given I am on the login page\n    When I enter valid credentials\n    Then I should see the dashboard',
    tags:         ['@smoke', '@e2e'],
    priority:     'critical',
    sourceType:   'jira',
    qualityScore: 85,
    generatedAt:  new Date().toISOString(),
  });

  await chroma.addScenarios([testScenario]);
  assert(await chroma.count() === 1, 'ChromaDB contains 1 scenario after upsert');

  const results = await chroma.search('authentication flow', 5);
  assert(results.ids[0].length > 0, 'Semantic search returns results');
  assert(
    results.metadatas[0][0]?.jiraStoryId === 'QA-101',
    'Semantic search finds the correct scenario'
  );

  // ── Test 4: Bus done signal ────────────────────────────────
  console.log('\n[4/4] Bus done signal...');
  const bus = createBus(process.env.REDIS_URL ?? 'redis://localhost:6379');
  let gotDone = false;
  await bus.subscribe('agents:requirements:orchestrator:done', async () => { gotDone = true; });
  await bus.publish('agents:requirements:orchestrator:done', {
    id:            randomUUID(),
    agentId:       'requirements',
    type:          'done',
    schemaVersion: '1.0.0',
    timestamp:     new Date().toISOString(),
    payload:       { runId: randomUUID(), totalIngested: 1, totalSkipped: 0, totalWarnings: 0, scenarios: [], skippedStories: [], completedAt: new Date().toISOString() },
  });
  await new Promise(r => setTimeout(r, 400));
  assert(gotDone, 'Requirements done signal received on bus');

  console.log('\n✅ Day 3 smoke test PASSED — Day 6 Test Generator is unblocked\n');
  await bus.close();
};

main().catch(e => { console.error(e); process.exit(1); });
