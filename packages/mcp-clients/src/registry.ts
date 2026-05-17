import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createPlaywrightMcp } from './playwright.js';
import { createGithubMcp }    from './github.js';
import { createJiraMcp }      from './jira.js';
import { createSlackMcp }     from './slack.js';

export interface McpRegistry {
  playwright: Client;
  github:     Client;
  jira:       Client;
  slack:      Client;
}

export const createMcpRegistry = async (): Promise<McpRegistry> => {
  const [playwright, github, jira, slack] = await Promise.all([
    createPlaywrightMcp(),
    createGithubMcp(),
    createJiraMcp(),
    createSlackMcp(),
  ]);
  return { playwright, github, jira, slack };
};

export interface HealthResult {
  name: string;
  ok: boolean;
  toolCount?: number;
  error?: string;
}

export const healthCheckAll = async (r: McpRegistry): Promise<HealthResult[]> => {
  const entries = Object.entries(r) as [keyof McpRegistry, Client][];
  return Promise.all(entries.map(async ([name, client]) => {
    try {
      const tools = await client.listTools();
      return { name, ok: true, toolCount: tools.tools.length };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { name, ok: false, error: msg };
    }
  }));
};
