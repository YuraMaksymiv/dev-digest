import type { McpServer } from '@modelcontextprotocol/server';
import { GET_BLAST_RADIUS } from './copy.js';
import { errorResult } from './result.js';

export function registerGetBlastRadius(server: McpServer): void {
  const { name, errorText, ...config } = GET_BLAST_RADIUS;
  server.registerTool(name, config, () => errorResult(errorText));
}
