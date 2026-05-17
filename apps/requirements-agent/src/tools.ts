import type OpenAI from 'openai';

// OpenAI / Gemini function-calling format
export const REQUIREMENTS_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_jira_stories',
      description: 'Fetch stories from a Jira project or epic. Returns story ID, title, description, and acceptance criteria.',
      parameters: {
        type: 'object',
        properties: {
          projectKey: { type: 'string', description: 'Jira project key e.g. QA' },
          epicId:     { type: 'string', description: 'Epic issue key e.g. QA-10' },
          maxResults: { type: 'number', description: 'Max stories to return, default 50' },
        },
        required: ['projectKey'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_confluence_spec',
      description: 'Fetch a Confluence page by title or ID. Returns full content as plain text.',
      parameters: {
        type: 'object',
        properties: {
          pageTitle: { type: 'string', description: 'Exact page title' },
          pageId:    { type: 'string', description: 'Confluence page ID' },
          spaceKey:  { type: 'string', description: 'Confluence space key' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'score_requirements_quality',
      description: "Score the quality of a Jira story's acceptance criteria. Returns quality score and recommendation (ingest/skip/warn).",
      parameters: {
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
  },
  {
    type: 'function',
    function: {
      name: 'generate_test_scenario',
      description: 'Convert a Jira story into a structured Gherkin test scenario with Given/When/Then format, tags, and priority.',
      parameters: {
        type: 'object',
        properties: {
          jiraStoryId:        { type: 'string' },
          title:              { type: 'string' },
          acceptanceCriteria: { type: 'string' },
          gherkin:            { type: 'string', description: 'Full Gherkin scenario (Given/When/Then)' },
          tags:               { type: 'array', items: { type: 'string' }, description: 'e.g. ["@smoke","@e2e"]' },
          priority:           { type: 'string', description: 'critical|high|medium|low' },
          qualityScore:       { type: 'number' },
        },
        required: ['jiraStoryId', 'title', 'acceptanceCriteria', 'gherkin'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_similar_scenarios',
      description: 'RAG retrieval — search ChromaDB for existing scenarios similar to a given story. Use this BEFORE generate_test_scenario to get context examples and avoid duplicates.',
      parameters: {
        type: 'object',
        properties: {
          query:  { type: 'string', description: 'Natural language query e.g. "user login authentication"' },
          topK:   { type: 'number', description: 'Number of results to return (default 3)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'parse_prd_pdf',
      description: 'Parse a PRD or specification PDF file and extract its text content. Use this when a PDF path is provided as input to extract requirements before scoring and scenario generation.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Absolute or relative path to the PDF file' },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'store_scenarios_in_chroma',
      description: 'Persist all generated test scenarios to ChromaDB vector store. Call once after all scenarios are ready.',
      parameters: {
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
  },
  {
    type: 'function',
    function: {
      name: 'save_scenarios_json',
      description: 'Write all generated scenarios to a JSON file for downstream agents.',
      parameters: {
        type: 'object',
        properties: {
          outputPath: { type: 'string', description: 'File path for JSON output' },
        },
      },
    },
  },
];
