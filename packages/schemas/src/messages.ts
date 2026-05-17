import { z } from 'zod';
import { SCHEMA_VERSION } from './version.js';

// Every message on the Redis bus must match this envelope
export const AgentMessageSchema = z.object({
  id:            z.string().uuid(),
  agentId:       z.string().min(1),
  type:          z.enum(['done', 'error', 'health', 'trigger', 'restart', 'shutdown', 'data']),
  timestamp:     z.string().datetime(),
  schemaVersion: z.literal(SCHEMA_VERSION),
  correlationId: z.string().uuid().optional(),
  payload:       z.record(z.unknown()),
});

export type AgentMessage = z.infer<typeof AgentMessageSchema>;

// ── Test Generator Agent output ────────────────────────────
export const GeneratedTestSchema = z.object({
  scenarioId:   z.string().uuid(),
  filePath:     z.string().regex(/^tests\/generated\/.+\.spec\.ts$/),
  content:      z.string().min(100),
  qualityScore: z.number().min(0).max(100).optional(),
  pomRefs:      z.array(z.string()),
  gitBranch:    z.string(),
});

export type GeneratedTest = z.infer<typeof GeneratedTestSchema>;

// ── Execution result (from the Execution Agent, Day 12) ────
export const ExecutionResultSchema = z.object({
  runId:      z.string().uuid(),
  testId:     z.string().uuid(),
  status:     z.enum(['passed', 'failed', 'flaky', 'skipped']),
  durationMs: z.number().nonnegative(),
  traceUrl:   z.string().url().optional(),
  errorMsg:   z.string().optional(),
  shard:      z.number().int().min(1).max(4),
});

export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

// ── Failure classification (from the Analysis Agent, Day 19) ─
export const FailureClassificationSchema = z.object({
  executionResultId: z.string().uuid(),
  category:          z.enum(['app_bug', 'test_flaky', 'env_issue', 'data_issue']),
  confidence:        z.enum(['high', 'medium', 'low']),
  explanation:       z.string(),
  autoHealable:      z.boolean(),
});

export type FailureClassification = z.infer<typeof FailureClassificationSchema>;
