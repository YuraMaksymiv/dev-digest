import type { McpServer } from '@modelcontextprotocol/server';
import { LIST_AGENTS } from './copy.js';
import type { ToolDeps } from './deps.js';
import { guard } from './result.js';

export function registerListAgents(server: McpServer, deps: ToolDeps): void {
  const { name, ...config } = LIST_AGENTS;
  server.registerTool(name, config, () => guard(deps.logger, () => deps.agentRuns.listAgents()));
}
