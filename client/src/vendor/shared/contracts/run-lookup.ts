import { z } from 'zod';

/**
 * Read-only lookups used by the local MCP server: one agent run's state, and a
 * PR resolved from `owner/name` + number (no GitHub call).
 */

export const RunDetail = z.object({
  run_id: z.string(),
  status: z.enum(['running', 'done', 'failed', 'cancelled']),
  agent_id: z.string(),
  agent_name: z.string().nullable(),
  pr_id: z.string(),
  pr_number: z.number().int(),
  /** repos.full_name, "owner/name". */
  repo: z.string(),
  ran_at: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  findings_count: z.number().int().nullable(),
  score: z.number().int().nullable(),
  /** Failure reason when status='failed'. */
  error: z.string().nullable(),
  /** Set once a review row (kind='review') exists for this run. */
  review_id: z.string().nullable(),
});
export type RunDetail = z.infer<typeof RunDetail>;

export const PrRef = z.object({
  pr_id: z.string(),
  repo_id: z.string(),
  repo: z.string(),
  number: z.number().int(),
  title: z.string(),
  status: z.string().nullable(),
  head_sha: z.string().nullable(),
});
export type PrRef = z.infer<typeof PrRef>;
