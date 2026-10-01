import type { McpServer } from '@modelcontextprotocol/server';
import { GET_CONVENTIONS } from './copy.js';
import type { ToolDeps } from './deps.js';
import { guard } from './result.js';

export function registerGetConventions(server: McpServer, deps: ToolDeps): void {
  const { name, ...config } = GET_CONVENTIONS;
  server.registerTool(name, config, (args) =>
    guard(deps.logger, () => deps.conventions.getConventions(args.repo, args.section)),
  );
}
