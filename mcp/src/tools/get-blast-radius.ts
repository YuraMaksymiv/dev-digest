import type { McpServer } from '@modelcontextprotocol/server';
import { GET_BLAST_RADIUS } from './copy.js';
import type { ToolDeps } from './deps.js';
import { guard } from './result.js';

export function registerGetBlastRadius(server: McpServer, deps: ToolDeps): void {
  const { name, ...config } = GET_BLAST_RADIUS;
  server.registerTool(name, config, (args) =>
    guard(deps.logger, () => deps.blast.getBlastRadius(args.repo, args.pr_number)),
  );
}
