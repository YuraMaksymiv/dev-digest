import type { McpServer } from '@modelcontextprotocol/server';
import { GET_FINDINGS } from './copy.js';
import type { ToolDeps } from './deps.js';
import { guard } from './result.js';

export function registerGetFindings(server: McpServer, deps: ToolDeps): void {
  const { name, ...config } = GET_FINDINGS;
  server.registerTool(name, config, (args) =>
    guard(deps.logger, () =>
      deps.findings.getFindings({
        runId: args.run_id,
        severity: args.severity,
        format: args.response_format,
        limit: args.limit,
        cursor: args.cursor,
      }),
    ),
  );
}
