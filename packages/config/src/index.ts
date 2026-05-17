export const config = {
  redisUrl:   process.env.REDIS_URL   ?? 'redis://localhost:6379',
  chromaUrl:  process.env.CHROMA_URL  ?? 'http://localhost:8000',
  githubMcpUrl: process.env.GITHUB_MCP_URL ?? 'http://localhost:8811/sse',
  jiraMcpUrl:   process.env.JIRA_MCP_URL   ?? 'http://localhost:8812/sse',

  requirements: {
    qualityThresholdIngest: Number(process.env.REQUIREMENTS_QUALITY_THRESHOLD_INGEST ?? 70),
    qualityThresholdWarn:   Number(process.env.REQUIREMENTS_QUALITY_THRESHOLD_WARN   ?? 40),
    maxStoriesPerRun:       Number(process.env.REQUIREMENTS_MAX_STORIES_PER_RUN      ?? 100),
    outputPath:             process.env.REQUIREMENTS_OUTPUT_PATH ?? 'test-scenarios.json',
    jiraProjectKey:         process.env.JIRA_PROJECT_KEY ?? 'QA',
  },
} as const;
