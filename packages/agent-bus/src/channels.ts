export const CHANNELS = {
  // Pattern: agents:{from}:{to}:{event}
  ORCH_BROADCAST: 'agents:orchestrator:*',
  REQ_DONE:       'agents:requirements:orchestrator:done',
  GEN_SUBMIT:     'agents:generator:review:submit',
  REVIEW_DONE:    'agents:review:orchestrator:done',
  EXEC_RESULTS:   'agents:execution:analysis:results',
  ANALYSIS_DONE:  'agents:analysis:rootcause:classified',
  ROOTCAUSE_DONE: 'agents:rootcause:reporting:done',
  HEALTH_ALL:     'agents:*:orchestrator:health',
  SHUTDOWN_ALL:   'agents:orchestrator:*:shutdown',
  RESTART: (agentId: string) => `agents:orchestrator:${agentId}:restart`,
} as const;

// Redis Streams (durable replay) — separate from pub/sub
export const STREAMS = {
  EXEC_RESULTS: 'stream:execution:results',
  GEN_TESTS:    'stream:generator:tests',
  FAILURES:     'stream:analysis:failures',
} as const;
