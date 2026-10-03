import type { McpServer } from '@modelcontextprotocol/server';
import { RUN_AGENT_ON_PR } from './copy.js';
import type { ToolDeps } from './deps.js';
import { guard } from './result.js';

export function registerRunAgentOnPr(server: McpServer, deps: ToolDeps): void {
  const { name, ...config } = RUN_AGENT_ON_PR;
  server.registerTool(name, config, (args, ctx) => {
    const progressToken = ctx.mcpReq._meta?.progressToken;
    let progress = 0;
    const onProgress =
      progressToken === undefined
        ? undefined
        : (message: string) => {
            progress += 1;
            ctx.mcpReq
              .notify({ method: 'notifications/progress', params: { progressToken, progress, message } })
              .catch((err: unknown) => deps.logger.warn('progress notification failed', { error: String(err) }));
          };

    return guard(deps.logger, () =>
      deps.agentRuns.runAgentOnPr(
        { repo: args.repo, prNumber: args.pr_number, agent: args.agent },
        { signal: ctx.mcpReq.signal, ...(onProgress ? { onProgress } : {}) },
      ),
    );
  });
}
