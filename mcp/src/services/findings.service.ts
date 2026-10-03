import { decodeCursor, type CursorScope } from '../domain/cursor.js';
import { ToolError } from '../domain/errors.js';
import {
  formatFindingsPage,
  formatPrFindings,
  formatRunCancelled,
  formatRunFailed,
  formatRunning,
  sortFindings,
} from '../domain/format.js';
import type { ResponseFormat, Severity, ToolOutput } from '../domain/types.js';
import { ApiError, type DevDigestApi } from '../ports.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GetFindingsInput {
  runId?: string | undefined;
  repo?: string | undefined;
  prNumber?: number | undefined;
  severity?: Severity | undefined;
  format: ResponseFormat;
  limit: number;
  cursor?: string | undefined;
}

export class FindingsService {
  constructor(private readonly api: DevDigestApi) {}

  async getFindings(input: GetFindingsInput): Promise<ToolOutput> {
    const byPr = input.repo !== undefined || input.prNumber !== undefined;
    if (input.runId !== undefined && byPr) {
      throw new ToolError('Pass either run_id, or repo + pr_number — not both.');
    }
    if (input.runId !== undefined) return this.getRunFindings({ ...input, runId: input.runId });
    if (input.repo === undefined || input.prNumber === undefined) {
      throw new ToolError(
        'Pass run_id (from run_agent_on_pr) for one run, or repo + pr_number for every agent review on that PR.',
      );
    }
    if (input.cursor !== undefined) {
      throw new ToolError('cursor only works with run_id. Use the run_id of one review to page through its findings.');
    }
    const pr = await this.api.lookupPull(input.repo, input.prNumber);
    const reviews = await this.api.listReviews(pr.prId);
    return {
      text: formatPrFindings({ pr, reviews, severity: input.severity, format: input.format, limit: input.limit }),
      isError: false,
    };
  }

  private async getRunFindings(input: GetFindingsInput & { runId: string }): Promise<ToolOutput> {
    if (!UUID.test(input.runId)) {
      throw new ToolError('Invalid run_id: use the run_id returned by run_agent_on_pr (a UUID).');
    }

    const run = await this.api.getRun(input.runId).catch((err: unknown) => {
      if (err instanceof ApiError && err.kind === 'not_found') {
        throw new ToolError(
          `Run ${input.runId} not found. Use the run_id returned by run_agent_on_pr (check it was copied exactly).`,
        );
      }
      throw err;
    });

    if (run.status === 'running') {
      return {
        text: formatRunning(run, `Not finished yet. Wait ~20s, then call get_findings(run_id="${run.runId}") again.`),
        isError: false,
      };
    }
    if (run.status === 'failed') return { text: formatRunFailed(run), isError: true };
    if (run.status === 'cancelled') return { text: formatRunCancelled(run), isError: true };

    const scope: CursorScope = { runId: run.runId, severity: input.severity };
    const offset = input.cursor ? decodeCursor(input.cursor, scope) : 0;

    const reviews = await this.api.listReviews(run.prId);
    const review = reviews.find((r) => r.runId === run.runId && r.kind === 'review');
    const all = review?.findings ?? [];
    const filtered = input.severity ? all.filter((f) => f.severity === input.severity) : all;

    return {
      text: formatFindingsPage({
        run,
        review,
        sorted: sortFindings(filtered),
        offset,
        limit: input.limit,
        format: input.format,
        scope,
      }),
      isError: false,
    };
  }
}
