import Anthropic from '@anthropic-ai/sdk';

export const REQUIREMENTS_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_jira_stories',
    description: 'Fetch stories from a Jira project or epic. Returns story ID, title, description, and acceptance criteria.',
    input_schema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'Jira project key e.g. QA' },
        epicId:     { type: 'string', description: 'Epic issue key e.g. QA-10' },
        maxResults: { type: 'number', description: 'Max stories to return, default 50' },
      },
      required: ['projectKey'],
    },
  },
  {
    name: 'get_confluence_spec',
    description: 'Fetch a Confluence page by title or ID. Returns full content as plain text.',
    input_schema: {
      type: 'object',
      properties: {
        pageTitle: { type: 'string', description: 'Exact page title' },
        pageId:    { type: 'string', description: 'Confluence page ID' },
        spaceKey:  { type: 'string', description: 'Confluence space key' },
      },
    },
  },
  {
    name: 'score_requirements_quality',
    description: "Score the quality of a Jira story's acceptance criteria. Returns quality score and recommendation (ingest/skip/warn).",
    input_schema: {
      type: 'object',
      properties: {
        jiraStoryId:        { type: 'string' },
        title:              { type: 'string' },
        acceptanceCriteria: { type: 'string' },
        description:        { type: 'string' },
      },
      required: ['jiraStoryId', 'title', 'acceptanceCriteria'],
    },
  },
  {
    name: 'generate_test_scenario',
    description: 'Convert a Jira story into a structured Gherkin test scenario with Given/When/Then format, tags, and priority.',
    input_schema: {
      type: 'object',
      properties: {
        jiraStoryId:        { type: 'string' },
        title:              { type: 'string' },
        acceptanceCriteria: { type: 'string' },
        gherkin:            { type: 'string', description: 'Full Gherkin scenario text' },
        tags:               { type: 'array', items: { type: 'string' }, description: 'e.g. ["@smoke","@e2e"]' },
        priority:           { type: 'string', description: 'critical|high|medium|low' },
        qualityScore:       { type: 'number' },
        featureContext:     { type: 'string', description: 'Extra context from Confluence if available' },
      },
      required: ['jiraStoryId', 'title', 'acceptanceCriteria', 'gherkin'],
    },
  },
  {
    name: 'store_scenarios_in_chroma',
    description: 'Persist all generated test scenarios to ChromaDB vector store. Call once after all scenarios are ready.',
    input_schema: {
      type: 'object',
      properties: {
        scenarios: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of TestScenario objects',
        },
      },
      required: ['scenarios'],
    },
  },
  {
    name: 'save_scenarios_json',
    description: 'Write all generated scenarios to a JSON file for downstream agents.',
    input_schema: {
      type: 'object',
      properties: {
        scenarios:  { type: 'array', items: { type: 'object' } },
        outputPath: { type: 'string', description: 'File path for the JSON output' },
      },
      required: ['scenarios'],
    },
  },
];
