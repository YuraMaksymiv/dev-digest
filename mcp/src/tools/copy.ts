import { z } from 'zod';

/**
 * Every model-facing string lives here: tools/list is the product's prompt, so
 * wording changes are deliberate and reviewed in one place. tools-list.test.ts
 * pins these byte-for-byte.
 */

export const SERVER_INSTRUCTIONS =
  'DevDigest reviews GitHub PRs that are already imported into the local DevDigest app. Workflow: list_agents → run_agent_on_pr (blocks up to 120s) → if status=running, poll get_findings(run_id). `repo` is always "owner/name". `agent` accepts a name or id from list_agents. Errors include a next step — follow it instead of retrying blindly.';

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const repoField = z
  .string()
  .regex(/^[^/\s]+\/[^/\s]+$/)
  .describe('owner/name');

export const LIST_AGENTS = {
  name: 'list_agents',
  description:
    'List the reviewer agents configured in DevDigest (name, id, enabled, one-line focus). Use a name or id from here as `agent` in run_agent_on_pr.',
  inputSchema: z.object({}),
  annotations: READ_ONLY,
} as const;

export const RUN_AGENT_ON_PR = {
  name: 'run_agent_on_pr',
  description:
    'Run one reviewer agent on an imported pull request and wait up to 120s for it to finish. Returns a findings summary, or run_id with status=running if still in progress — then call get_findings.',
  inputSchema: z.object({
    repo: repoField,
    pr_number: z.number().int().positive(),
    agent: z.string().describe('Agent name or id from list_agents'),
  }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
} as const;

export const GET_FINDINGS = {
  name: 'get_findings',
  description:
    'Get the status and findings of a review run by run_id. Returns status=running until done; results are paginated (use cursor) and response_format=detailed adds rationale and fix suggestions.',
  inputSchema: z.object({
    run_id: z.string(),
    severity: z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']).optional(),
    response_format: z.enum(['concise', 'detailed']).default('concise'),
    limit: z.number().int().min(1).max(50).default(10),
    cursor: z.string().optional().describe('From the previous response'),
  }),
  annotations: READ_ONLY,
} as const;

export const GET_CONVENTIONS = {
  name: 'get_conventions',
  description:
    'Get the accepted coding conventions DevDigest applies when reviewing a repo, one line per rule. Use `section` to narrow the output.',
  inputSchema: z.object({
    repo: repoField,
    section: z
      .enum(['naming', 'structure', 'error_handling', 'async', 'typing', 'testing', 'imports', 'api'])
      .optional(),
  }),
  annotations: READ_ONLY,
} as const;

export const GET_BLAST_RADIUS = {
  name: 'get_blast_radius',
  description: 'NOT IMPLEMENTED YET — always returns an error. Do not call; use get_findings instead.',
  inputSchema: z.object({
    repo: repoField,
    pr_number: z.number().int().positive(),
  }),
  annotations: READ_ONLY,
  errorText: 'get_blast_radius is not implemented yet; no data exists. Do not retry — use get_findings instead.',
} as const;
