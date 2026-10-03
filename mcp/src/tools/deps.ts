import type { AgentRunService } from '../services/agent-run.service.js';
import type { BlastService } from '../services/blast.service.js';
import type { ConventionsService } from '../services/conventions.service.js';
import type { FindingsService } from '../services/findings.service.js';
import type { Logger } from '../ports.js';

export interface ToolDeps {
  agentRuns: AgentRunService;
  findings: FindingsService;
  conventions: ConventionsService;
  blast: BlastService;
  logger: Logger;
}
