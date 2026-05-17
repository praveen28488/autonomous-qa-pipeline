import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

export const createJiraMcp = async (
  url = process.env.JIRA_MCP_URL ?? 'http://localhost:8812/sse'
): Promise<Client> => {
  const transport = new SSEClientTransport(new URL(url));
  const client = new Client({ name: 'jira-mcp-client', version: '1.0.0' });

  await client.connect(transport);
  console.log('[mcp:jira] connected');
  return client;
};

export const createConfluenceMcp = createJiraMcp;
