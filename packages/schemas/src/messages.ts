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
