import { createBus }         from '@qa/agent-bus';
import { createMcpRegistry } from '@qa/mcp-clients';
import type { McpRegistry }  from '@qa/mcp-clients';
import { ChromaStore }       from './chroma-store.js';
import { RequirementsAgent } from './agent.js';

const main = async () => {
  console.log('[requirements-agent] starting...');

  // 1. Connect to infrastructure
  const bus    = createBus(process.env.REDIS_URL);
  const chroma = new ChromaStore(process.env.CHROMA_URL ?? 'http://localhost:8000');
  await chroma.connect();

  // 2. Attempt to connect to the MCP registry (Jira, GitHub, Playwright, Slack).
  //    When Jira credentials are not configured the containers restart with placeholder
  //    creds — the agent falls back to built-in mock stories automatically.
  let mcp: McpRegistry | null = null;
  if (process.env.JIRA_URL) {
    try {
      mcp = await createMcpRegistry();
      console.log('[requirements-agent] MCP registry connected');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[requirements-agent] MCP registry unavailable (${msg})`);
      console.warn('[requirements-agent] Falling back to mock Jira data');
    }
  } else {
    console.log('[requirements-agent] JIRA_URL not set — using mock Jira data');
  }

  // 3. Create the agent
  const agent = new RequirementsAgent(
    { id: 'requirements', bus },
    mcp,
    chroma,
  );

  // 4. Start heartbeat so Orchestrator knows we are alive
  agent.startHeartbeat();

  // 5. Run immediately (dev/test) or wait for Orchestrator trigger (production)
  if (process.env.RUN_IMMEDIATELY === 'true') {
    const projectKey = process.env.JIRA_PROJECT_KEY ?? 'QA';
    await agent.run(
      `Ingest all stories from Jira project ${projectKey}.
       Score each story's acceptance criteria quality.
       For qualifying stories (ingest / ingest_with_warning), generate a full Gherkin scenario.
       Once all scenarios are generated, store them in ChromaDB and save JSON output to test-scenarios.json.`
    );
    agent.stopHeartbeat();
    process.exit(0);
  } else {
    // Production mode: wait for Orchestrator trigger
    await bus.subscribe(
      'agents:orchestrator:requirements:trigger',
      async (msg) => {
        const { projectKey, epicId } = msg.payload as Record<string, string>;
        await agent.run(
          `Ingest stories from Jira project ${projectKey}${epicId ? ` epic ${epicId}` : ''}.
           Score quality, generate Gherkin scenarios, store in ChromaDB, save JSON.`
        );
      }
    );
    console.log('[requirements-agent] waiting for trigger from orchestrator');
  }
};

main().catch(e => { console.error(e); process.exit(1); });
