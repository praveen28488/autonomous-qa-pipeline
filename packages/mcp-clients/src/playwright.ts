import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export const createPlaywrightMcp = async (): Promise<Client> => {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['@playwright/mcp', '--headless', '--no-sandbox'],
    env: { ...process.env } as Record<string, string>,
  });

  const client = new Client({ name: 'playwright-mcp-client', version: '1.0.0' });

  await client.connect(transport);
  console.log('[mcp:playwright] connected');
  return client;
};
