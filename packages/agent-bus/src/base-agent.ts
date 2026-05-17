import OpenAI from 'openai';
import { Bus } from './bus.js';
import { randomUUID } from 'crypto';

// Use Google Gemini via its OpenAI-compatible endpoint — free tier, no credit card
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const DEFAULT_MODEL   = 'gemini-2.0-flash';

type GeminiTool = OpenAI.ChatCompletionTool;

// Conversation messages accumulate across the agentic loop
type AgentState = {
  messages: OpenAI.ChatCompletionMessageParam[];
};

export interface AgentConfig {
  id:           string;
  model?:       string;
  maxTokens?:   number;
  tools:        GeminiTool[];
  systemPrompt: string;
  bus:          Bus;
}

/**
 * BaseAgent — foundation every pipeline agent extends.
 *
 * Implements the agentic loop:
 *   think (call Gemini) → act (execute tool calls) → repeat until stop → emit
 *
 * Uses Google Gemini via OpenAI-compatible API (free tier).
 * Subclasses implement: executeTool() and emitNode().
 */
export abstract class BaseAgent {
  protected llm: OpenAI;
  private   heartbeatTimer?: ReturnType<typeof setInterval>;

  constructor(protected cfg: AgentConfig) {
    this.llm = new OpenAI({
      apiKey:  process.env.GEMINI_API_KEY ?? '',
      baseURL: GEMINI_BASE_URL,
    });
  }

  /** Run the agent from an initial user message. */
  async run(initialMessage: string): Promise<void> {
    const state: AgentState = {
      messages: [
        // System prompt as first message (Gemini supports system role)
        ...(this.cfg.systemPrompt
          ? [{ role: 'system' as const, content: this.cfg.systemPrompt }]
          : []),
        { role: 'user', content: initialMessage },
      ],
    };

    // Agentic loop: think → act → think → ... → emit
    while (true) {
      // ── Think: call Gemini ────────────────────────────────
      const response = await this.llm.chat.completions.create({
        model:      this.cfg.model ?? DEFAULT_MODEL,
        max_tokens: this.cfg.maxTokens ?? 4096,
        tools:      this.cfg.tools.length ? this.cfg.tools : undefined,
        messages:   state.messages,
      });

      const choice  = response.choices[0];
      const message = choice.message;

      // Append the assistant's response to conversation history
      state.messages.push({
        role:       'assistant',
        content:    message.content ?? null,
        tool_calls: message.tool_calls,
      });

      // ── Act: execute any tool calls ───────────────────────
      const toolCalls = message.tool_calls ?? [];

      if (toolCalls.length > 0) {
        // Execute all tool calls concurrently
        const toolResults = (await Promise.all(
          toolCalls
            .filter((tc): tc is OpenAI.ChatCompletionMessageToolCall & { type: 'function' } =>
              tc.type === 'function'
            )
            .map(async (tc) => {
              try {
                const input  = JSON.parse(tc.function.arguments);
                const output = await this.executeTool(tc.function.name, input);
                return {
                  role:         'tool' as const,
                  tool_call_id: tc.id,
                  content:      JSON.stringify(output),
                };
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                return {
                  role:         'tool' as const,
                  tool_call_id: tc.id,
                  content:      `Error: ${msg}`,
                };
              }
            })
        )).filter(Boolean) as OpenAI.ChatCompletionToolMessageParam[];

        // Feed tool results back to Gemini
        state.messages.push(...toolResults);
      }

      // ── Loop control ──────────────────────────────────────
      // Continue only if Gemini made tool calls and hasn't stopped
      const shouldContinue = toolCalls.length > 0 && choice.finish_reason === 'tool_calls';
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
      } catch { /* heartbeat failures are non-fatal */ }
    }, 10_000);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
  }
}
