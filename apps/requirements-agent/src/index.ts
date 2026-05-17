import { createBus }         from '@qa/agent-bus';
import { ChromaStore }       from './chroma-store.js';
import { RequirementsAgent } from './agent.js';

const main = async () => {
  console.log('[requirements-agent] starting...');

  const useMockData = !process.env.JIRA_URL; // use mock if no real Jira configured
  const bus         = createBus(process.env.REDIS_URL);
  const chroma      = new ChromaStore(process.env.CHROMA_URL ?? 'http://localhost:8000');
  await chroma.connect();

  const agent = new RequirementsAgent(
    { id: 'requirements', bus },
    chroma,
    useMockData
  );

  agent.startHeartbeat();

  if (process.env.RUN_IMMEDIATELY === 'true') {
    const projectKey = process.env.JIRA_PROJECT_KEY ?? 'QA';
    await agent.run(
      `Ingest all stories from Jira project ${projectKey}.
       Score each story's quality, generate Gherkin scenarios for qualifying stories,
       store all scenarios in ChromaDB, and save JSON output to test-scenarios.json.`
    );
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
