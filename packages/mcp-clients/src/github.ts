import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

export const createGithubMcp = async (
  url = process.env.GITHUB_MCP_URL ?? 'http://localhost:8811/sse'
): Promise<Client> => {
  const transport = new SSEClientTransport(new URL(url));
  const client = new Client({ name: 'github-mcp-client', version: '1.0.0' });

  await client.connect(transport);
  console.log('[mcp:github] connected');
  return client;
};
