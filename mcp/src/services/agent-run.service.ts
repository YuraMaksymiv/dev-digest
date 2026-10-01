import {
  formatAgents,
  formatRunCancelled,
  formatRunFailed,
  formatRunning,
  formatRunSummary,
} from '../domain/format.js';
import type { ToolOutput } from '../domain/types.js';
import type { DevDigestApi } from '../ports.js';
import { RUN_WAIT_MS } from './constants.js';
import { resolveAgent } from './resolve.js';

export interface RunAgentInput {
  repo: string;
  prNumber: number;
  agent: string;
}

export interface RunAgentHooks {
  /** Client cancelled the tool call: stop waiting. The server-side run is left running. */
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}

export class AgentRunService {
  constructor(private readonly api: DevDigestApi) {}

  async listAgents(): Promise<ToolOutput> {
    return { text: formatAgents(await this.api.listAgents()), isError: false };
  }

  async runAgentOnPr(input: RunAgentInput, hooks: RunAgentHooks = {}): Promise<ToolOutput> {
    const agent = resolveAgent(await this.api.listAgents(), input.agent);
    const pr = await this.api.lookupPull(input.repo, input.prNumber);
    const started = await this.api.startReview(pr.prId, agent.id);

    await this.waitUntilFinished(started.runId, hooks);

    const run = await this.api.getRun(started.runId);
    switch (run.status) {
      case 'done': {
        const reviews = await this.api.listReviews(run.prId);
        const review = reviews.find((r) => r.runId === run.runId && r.kind === 'review');
        return { text: formatRunSummary(run, review), isError: false };
      }
      case 'failed':
        return { text: formatRunFailed(run), isError: true };
      case 'cancelled':
        return { text: formatRunCancelled(run), isError: true };
      case 'running':
        return {
          text: formatRunning(
            run,
            `Still in progress after ${RUN_WAIT_MS / 1000}s. Call get_findings(run_id="${run.runId}") to poll; the run keeps going on the server.`,
          ),
          isError: false,
        };
    }
  }

  private async waitUntilFinished(runId: string, hooks: RunAgentHooks): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RUN_WAIT_MS);
    const onClientAbort = () => controller.abort();
    if (hooks.signal?.aborted) controller.abort();
    else hooks.signal?.addEventListener('abort', onClientAbort, { once: true });
    try {
      await this.api.waitForRun(runId, {
        signal: controller.signal,
        ...(hooks.onProgress ? { onEvent: (e) => hooks.onProgress?.(e.message) } : {}),
      });
    } finally {
      clearTimeout(timer);
      hooks.signal?.removeEventListener('abort', onClientAbort);
    }
  }
}
