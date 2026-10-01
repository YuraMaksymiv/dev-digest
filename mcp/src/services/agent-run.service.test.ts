import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolError } from '../domain/errors.js';
import type { Finding } from '../domain/types.js';
import { ApiError } from '../ports.js';
import { AGENTS, FakeApi, hangUntilAbort, RUN_ID, review, runDetail } from '../test-support/fake-api.js';
import { AgentRunService } from './agent-run.service.js';

const input = { repo: 'acme/widgets', prNumber: 7, agent: 'General Reviewer' };

function finding(over: Partial<Finding>): Finding {
  return {
    id: 'f1',
    severity: 'WARNING',
    category: 'bug',
    title: 'Null deref',
    file: 'src/a.ts',
    startLine: 3,
    endLine: 3,
    rationale: 'because',
    suggestion: null,
    ...over,
  };
}

describe('AgentRunService', () => {
  let api: FakeApi;
  let service: AgentRunService;
  beforeEach(() => {
    api = new FakeApi();
    service = new AgentRunService(api);
  });
  afterEach(() => vi.useRealTimers());

  it('lists agents with name, id and enabled state', async () => {
    const out = await service.listAgents();
    expect(out.isError).toBe(false);
    expect(out.text).toContain('General Reviewer (id: a-general) enabled');
  });

  it('returns a concise severity-sorted summary when the run is done', async () => {
    api.reviews = [
      review([
        finding({ id: 'w', severity: 'WARNING', title: 'Warn' }),
        finding({ id: 'c', severity: 'CRITICAL', title: 'Crit' }),
      ]),
    ];
    const out = await service.runAgentOnPr(input);

    expect(out.isError).toBe(false);
    expect(out.text).toContain('status=done');
    expect(out.text).toContain('2 findings (1 critical, 1 warning, 0 suggestion)');
    expect(out.text.indexOf('Crit')).toBeLessThan(out.text.indexOf('Warn'));
    expect(api.calls).toContain('startReview 22222222-2222-4222-8222-222222222222 a-general');
  });

  it('caps the inline summary and points to get_findings', async () => {
    api.reviews = [review(Array.from({ length: 8 }, (_, i) => finding({ id: `f${i}`, startLine: i + 1 })))];
    const out = await service.runAgentOnPr(input);
    expect(out.text).toContain('... 3 more');
    expect(out.text).toContain(`get_findings(run_id="${RUN_ID}")`);
  });

  it('resolves the agent by id', async () => {
    await service.runAgentOnPr({ ...input, agent: 'a-security' });
    expect(api.calls.some((c) => c.endsWith('a-security'))).toBe(true);
  });

  it('reports a failed run as an error with the reason', async () => {
    api.run = runDetail({ status: 'failed', error: 'no provider key' });
    const out = await service.runAgentOnPr(input);
    expect(out.isError).toBe(true);
    expect(out.text).toContain('status=failed');
    expect(out.text).toContain('<untrusted_review_output>');
    expect(out.text).toContain('no provider key');
  });

  it('reports a cancelled run as an error', async () => {
    api.run = runDetail({ status: 'cancelled' });
    const out = await service.runAgentOnPr(input);
    expect(out.isError).toBe(true);
    expect(out.text).toContain('status=cancelled');
  });

  it('forwards run events as progress', async () => {
    api.wait = async (_id, { onEvent }) => {
      onEvent?.({ message: 'loading diff' });
      onEvent?.({ message: 'calling model' });
      return 'ended';
    };
    const seen: string[] = [];
    await service.runAgentOnPr(input, { onProgress: (m) => seen.push(m) });
    expect(seen).toEqual(['loading diff', 'calling model']);
  });

  it('times out at exactly 120s and hands back run_id with status=running', async () => {
    vi.useFakeTimers();
    api.wait = hangUntilAbort;
    api.run = runDetail({ status: 'running' });

    let settled = false;
    const pending = service.runAgentOnPr(input).then((o) => {
      settled = true;
      return o;
    });

    await vi.advanceTimersByTimeAsync(119_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const out = await pending;

    expect(out.isError).toBe(false);
    expect(out.text).toContain(`run_id=${RUN_ID}`);
    expect(out.text).toContain('status=running');
    expect(out.text).toContain(`get_findings(run_id="${RUN_ID}")`);
  });

  it('stops waiting on client abort without touching the run', async () => {
    api.wait = hangUntilAbort;
    api.run = runDetail({ status: 'running' });
    const controller = new AbortController();

    const pending = service.runAgentOnPr(input, { signal: controller.signal });
    await vi.waitFor(() => expect(api.calls.some((c) => c.startsWith('waitForRun'))).toBe(true));
    controller.abort();
    const out = await pending;

    expect(out.text).toContain('status=running');
    expect(api.calls.some((c) => /cancel/i.test(c))).toBe(false);
  });

  it('rejects an ambiguous agent name and asks for the id', async () => {
    api.agents = [...AGENTS, { id: 'dup', name: 'general reviewer', description: '', enabled: true }];
    const err = await service.runAgentOnPr(input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect((err as Error).message).toContain('ambiguous');
    expect((err as Error).message).toContain('a-general');
    expect((err as Error).message).toContain('dup');
    expect(api.calls.some((c) => c.startsWith('startReview'))).toBe(false);
  });

  it('lists available agents when none matches', async () => {
    const err = await service.runAgentOnPr({ ...input, agent: 'nope' }).catch((e: unknown) => e);
    expect((err as Error).message).toContain('Available agents: General Reviewer, Security Reviewer');
  });

  it('propagates a not-imported PR error without starting a run', async () => {
    api.lookupError = new ApiError('not_found', 'Not found: PR #7 is not imported for acme/widgets');
    await expect(service.runAgentOnPr(input)).rejects.toThrow('PR #7 is not imported');
    expect(api.calls.some((c) => c.startsWith('startReview'))).toBe(false);
  });
});
