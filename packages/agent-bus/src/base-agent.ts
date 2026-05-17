import Anthropic from '@anthropic-ai/sdk';
import { Bus } from './bus.js';
import { randomUUID } from 'crypto';

// Messages accumulate as the agentic loop progresses
type AgentState = {
  messages:  Anthropic.MessageParam[];
  lastResp:  Anthropic.Message | null;
};

export interface AgentConfig {
  id:           string;
  model?:       string;
  maxTokens?:   number;
  tools:        Anthropic.Tool[];
  systemPrompt: string;
  bus:          Bus;
}

/**
 * BaseAgent — the foundation every pipeline agent extends.
 *
 * Implements the agentic loop pattern:
 *   think (call Claude) → act (execute tool calls) → repeat until end_turn → emit
 *
 * Subclasses must implement:
 *   executeTool(name, input) — what to do when Claude calls a tool
 *   emitNode(state)         — publish the done signal to the bus
 */
export abstract class BaseAgent {
  protected claude: Anthropic;
  private   heartbeatTimer?: ReturnType<typeof setInterval>;

  constructor(protected cfg: AgentConfig) {
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  /** Run the agent from an initial user message. */
  async run(initialMessage: string): Promise<void> {
    const state: AgentState = {
      messages: [{ role: 'user', content: initialMessage }],
      lastResp: null,
    };

    // Agentic loop: think → act → think → ... → emit
    while (true) {
      // ── Think: call Claude ───────────────────────────────
      const resp = await this.claude.messages.create({
        model:      this.cfg.model ?? 'claude-sonnet-4-20250514',
        max_tokens: this.cfg.maxTokens ?? 4096,
        system:     this.cfg.systemPrompt,
        tools:      this.cfg.tools.length ? this.cfg.tools : undefined,
        messages:   state.messages,
      });

      state.lastResp = resp;
      // Append Claude's response to the conversation
      state.messages.push({ role: 'assistant', content: resp.content });

      // ── Act: execute any tool calls ───────────────────────
      const toolUses = resp.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      );

      if (toolUses.length > 0) {
        // Execute all tool calls concurrently
        const toolResults = await Promise.all(
          toolUses.map(async (tu) => {
            try {
              const output = await this.executeTool(tu.name, tu.input);
              return {
                type:        'tool_result' as const,
                tool_use_id: tu.id,
                content:     JSON.stringify(output),
              };
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              return {
                type:        'tool_result' as const,
                tool_use_id: tu.id,
                content:     `Error: ${msg}`,
                is_error:    true,
              };
            }
          })
        );

        // Feed tool results back to Claude
        state.messages.push({ role: 'user', content: toolResults });
      }

      // ── Loop control ─────────────────────────────────────
      // Continue if Claude made tool calls (it wants to do more work)
      // Stop if Claude sent end_turn (it's finished)
      const shouldContinue = toolUses.length > 0 && resp.stop_reason !== 'end_turn';
      if (!shouldContinue) break;
    }

    // ── Emit: publish done signal to the bus ─────────────
    await this.emitNode(state);
  }

  // ── Abstract methods subclasses must implement ──────────

  protected abstract executeTool(name: string, input: unknown): Promise<unknown>;

  protected abstract emitNode(state: AgentState): Promise<void>;

  // ── Heartbeat: lets Orchestrator know this agent is alive ─

  startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.cfg.bus.publish(
          `agents:${this.cfg.id}:orchestrator:health`,
          {
            id:            randomUUID(),
            agentId:       this.cfg.id,
            type:          'health',
            schemaVersion: '1.0.0',
            timestamp:     new Date().toISOString(),
            payload:       { status: 'alive', ts: Date.now() },
          }
        );
      } catch {
        // heartbeat failures are non-fatal
      }
    }, 10_000);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
  }
}
