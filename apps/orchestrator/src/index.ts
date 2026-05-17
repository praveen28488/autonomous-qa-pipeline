import { BaseAgent, AgentConfig, createBus, CHANNELS } from '@qa/agent-bus';
import { AgentMessage, SCHEMA_VERSION } from '@qa/schemas';
import { randomUUID } from 'crypto';

class OrchestratorAgent extends BaseAgent {
  private agentLastSeen = new Map<string, number>();
  private failureCount  = new Map<string, number>();

  async start() {
    await this.cfg.bus.subscribe('agents:*:orchestrator:*', this.handleMessage.bind(this));
    this.startHeartbeat();
    this.startHeartbeatMonitor();
    console.log('[orchestrator] listening on bus — ready');
  }

  private async handleMessage(msg: AgentMessage) {
    switch (msg.type) {
      case 'health':
        this.agentLastSeen.set(msg.agentId, Date.now());
        this.failureCount.set(msg.agentId, 0);
        break;
      case 'done':
        await this.triggerDownstream(msg);
        break;
      case 'error':
        await this.handleAgentError(msg);
        break;
    }
  }

  private async triggerDownstream(msg: AgentMessage) {
    console.log(`[orchestrator] routing downstream from ${msg.agentId}`);

    switch (msg.agentId) {
      case 'requirements': {
        const output = msg.payload as Record<string, unknown>;
        console.log(
          `[orchestrator] requirements done — ` +
          `${output.totalIngested} scenarios, ${output.totalSkipped} skipped`
        );
        // Day 6: uncomment when Test Generator is built
        // await this.cfg.bus.publish('agents:orchestrator:generator:trigger', {
        //   id: randomUUID(), agentId: 'orchestrator', type: 'trigger',
        //   schemaVersion: SCHEMA_VERSION, timestamp: new Date().toISOString(),
        //   payload: { scenarioCount: output.totalIngested }
        // });
        break;
      }
      default:
        console.log(`[orchestrator] no routing rule yet for ${msg.agentId}`);
    }
  }

  private async handleAgentError(msg: AgentMessage) {
    const count = (this.failureCount.get(msg.agentId) ?? 0) + 1;
    this.failureCount.set(msg.agentId, count);
    if (count >= 3) {
      // Circuit breaker: stop triggering a repeatedly failing agent
      console.error(`[orchestrator] circuit open for ${msg.agentId} after 3 errors`);
    } else {
      console.warn(`[orchestrator] error from ${msg.agentId} (${count}/3):`, msg.payload);
    }
  }

  private startHeartbeatMonitor() {
    setInterval(async () => {
      const now = Date.now();
      for (const [id, last] of this.agentLastSeen) {
        if (now - last > 30_000) {
          console.warn(`[orchestrator] ${id} missed heartbeat — sending restart signal`);
          await this.cfg.bus.publish(CHANNELS.RESTART(id), {
            id: randomUUID(), agentId: 'orchestrator',
            type: 'restart', schemaVersion: SCHEMA_VERSION,
            timestamp: new Date().toISOString(), payload: {},
          });
        }
      }
    }, 10_000);
  }

  // Orchestrator has no tools of its own
  protected async executeTool(): Promise<unknown> { return {}; }
  protected async emitNode(): Promise<void> { /* no-op */ }
}

// Entry point
const bus  = createBus(process.env.REDIS_URL);
const orch = new OrchestratorAgent({
  id: 'orchestrator', bus, tools: [], systemPrompt: '',
});

orch.start()
  .then(() => console.log('[orchestrator] ready'))
  .catch(e => { console.error(e); process.exit(1); });
