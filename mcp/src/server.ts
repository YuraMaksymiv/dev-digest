import { McpServer } from '@modelcontextprotocol/server';
import { AgentRunService } from './services/agent-run.service.js';
import { BlastService } from './services/blast.service.js';
import { ConventionsService } from './services/conventions.service.js';
import { FindingsService } from './services/findings.service.js';
import type { DevDigestApi, Logger } from './ports.js';
import { SERVER_INSTRUCTIONS } from './tools/copy.js';
import { registerGetBlastRadius } from './tools/get-blast-radius.js';
import { registerGetConventions } from './tools/get-conventions.js';
import { registerGetFindings } from './tools/get-findings.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerRunAgentOnPr } from './tools/run-agent-on-pr.js';

export interface ServerDeps {
  api: DevDigestApi;
  logger: Logger;
}

/** Composition root: wires services over the injected API port and registers tools in a fixed order. */
export function createServer({ api, logger }: ServerDeps): McpServer {
  const server = new McpServer(
    { name: 'devdigest', version: '0.0.0' },
    { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS },
  );
  const deps = {
    agentRuns: new AgentRunService(api),
    findings: new FindingsService(api),
    conventions: new ConventionsService(api),
    blast: new BlastService(api),
    logger,
  };

  registerListAgents(server, deps);
  registerRunAgentOnPr(server, deps);
  registerGetFindings(server, deps);
  registerGetConventions(server, deps);
  registerGetBlastRadius(server, deps);

  return server;
}
