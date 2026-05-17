import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export const createSlackMcp = async (): Promise<Client> => {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    env: {
      ...process.env,
      SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN ?? '',
      SLACK_TEAM_ID:   process.env.SLACK_TEAM_ID   ?? '',
    } as Record<string, string>,
  });

  const client = new Client({ name: 'slack-mcp-client', version: '1.0.0' });

  await client.connect(transport);
  console.log('[mcp:slack] connected');
  return client;
};
