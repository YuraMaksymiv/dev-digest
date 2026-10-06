import { describe, expect, it, vi } from 'vitest';
import type { PrBrief, PrBriefModelOutput } from '@devdigest/shared';
import { BriefService, type BriefDeps } from '../src/modules/brief/service.js';
import { BriefRepository } from '../src/modules/brief/repository.js';
import { NotFoundError } from '../src/platform/errors.js';

const PATCH = '@@ -1,2 +10,4 @@\n+x';
const pull = { id: 'p1', repoId: 'r1', number: 4, title: 'Add retries', body: 'desc', branch: 'b', headSha: 'sha-new' };
const files = [{ path: 'src/a.ts', additions: 3, deletions: 1, patch: PATCH }];
const GOOD: PrBriefModelOutput = {
  summary: 'Adds retries.',
  risks: [
    { kind: 'k', title: 'Retry storm', explanation: 'e', severity: 'high', file_refs: ['src/a.ts'] },
    { kind: 'k', title: 'Ghost', explanation: 'e', severity: 'low', file_refs: ['src/ghost.ts'] },
  ],
  review_focus: [
    { file: 'src/a.ts', line: 11, reason: 'in range' },
    { file: 'src/a.ts', line: 500, reason: 'out of range' },
  ],
};
const llmResult = (data: unknown = GOOD) => ({
  data, model: 'resolved', tokensIn: 700, tokensOut: 90, costUsd: 0.01, raw: '', attempts: 1,
});
const stored = (over: Partial<PrBrief> = {}): PrBrief => ({
  summary: 'old', risks: [], review_focus: [], head_sha: 'sha-old', generated_at: '2026-10-01T00:00:00.000Z',
  model: 'm', tokens_in: 1, tokens_out: 2, cost_usd: 0.5, missing_inputs: [], ...over,
});

interface Opts {
  stored?: PrBrief | null;
  pull?: typeof pull | undefined;
  complete?: ReturnType<typeof vi.fn>;
  blast?: () => Promise<unknown>;
  issue?: { state: 'fetched' | 'unavailable' | 'absent' };
  specs?: { source: string; text: string }[];
  intent?: unknown;
  files?: typeof files;
}
function make(o: Opts = {}) {
  const logs: { obj: Record<string, unknown>; msg: string }[] = [];
  let cache: PrBrief | null = o.stored === undefined ? null : o.stored;
  const upsert = vi.fn(async (_id: string, b: PrBrief) => void (cache = b));
  const repo = { get: vi.fn(async () => cache), upsert };
  const createAgentRun = vi.fn(async () => 'run1');
  const completeAgentRun = vi.fn(async () => undefined);
  const reviewRepo = {
    getPull: vi.fn(async () => ('pull' in o ? o.pull : pull)),
    getRepo: vi.fn(async () => ({ id: 'r1', owner: 'o', name: 'n' })),
    getPrFiles: vi.fn(async () => o.files ?? files),
    getIntent: vi.fn(async () => o.intent ?? undefined),
    createAgentRun,
    completeAgentRun,
  };
  const getBlast = vi.fn(
    o.blast ??
      (async () => ({
        changed_symbols: [{ name: 'f', file: 'src/a.ts', kind: 'fn' }],
        downstream: [{ symbol: 'f', callers: [{ name: 'g', file: 'src/caller.ts', line: 3 }], endpoints_affected: [], crons_affected: [] }],
        summary: 'one symbol',
      })),
  );
  const linkedIssue = vi.fn(async () => (o.issue ?? { state: 'absent' }) as never);
  const complete = o.complete ?? vi.fn(async (_req: unknown) => llmResult());
  const llmFor = vi.fn(async (_p: string) => ({ completeStructured: complete }) as never);
  const svc = new BriefService({
    repo: repo as unknown as BriefDeps['repo'],
    reviewRepo: reviewRepo as unknown as BriefDeps['reviewRepo'],
    blast: { getBlast } as never,
    linkedIssue,
    specs: { resolveForRepo: async () => ({ texts: o.specs ?? [], specs_detail: [], specs_read: [] }) },
    tokenizer: { count: (s) => Math.ceil(s.length / 4) },
    llm: llmFor,
    log: { info: (obj, msg) => logs.push({ obj, msg }), warn: (obj, msg) => logs.push({ obj, msg }) },
    now: () => new Date('2026-10-04T12:00:00Z'),
  });
  const model = vi.fn(async () => ({ provider: 'openrouter' as const, model: 'feature-model' }));
  return { svc, repo, upsert, complete, llmFor, getBlast, linkedIssue, reviewRepo, createAgentRun, completeAgentRun, logs, model, cache: () => cache };
}

describe('BriefService.get', () => {
  it('AC-1, NFR-2: returns the cached brief with stale from head_sha, with no model, blast or GitHub call', async () => {
    const t = make({ stored: stored() });
    const res = await t.svc.get('w', 'p1');
    expect(res).toMatchObject({ summary: 'old', stale: true });
    const fresh = make({ stored: stored({ head_sha: 'sha-new' }) });
    expect((await fresh.svc.get('w', 'p1'))?.stale).toBe(false);
    for (const x of [t, fresh]) {
      expect(x.complete).not.toHaveBeenCalled();
      expect(x.llmFor).not.toHaveBeenCalled();
      expect(x.getBlast).not.toHaveBeenCalled();
      expect(x.linkedIssue).not.toHaveBeenCalled();
    }
  });

  it('AC-2: no brief gives null', async () => {
    expect(await make().svc.get('w', 'p1')).toBeNull();
  });

  it('AC-3: unknown PR is a NotFoundError for get and generate', async () => {
    const t = make({ pull: undefined });
    await expect(t.svc.get('w', 'p1')).rejects.toBeInstanceOf(NotFoundError);
    await expect(t.svc.generate('w', 'p1', t.model)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('NFR-4: stored JSON that does not parse as a PrBrief is treated as no brief', async () => {
    const db = { select: () => ({ from: () => ({ where: async () => [{ json: { risks: 'old shape', history: [] } }] }) }) };
    const repo = new BriefRepository(db as never);
    expect(await repo.get('p1')).toBeNull();
    const good = { select: () => ({ from: () => ({ where: async () => [{ json: stored() }] }) }) };
    expect(await new BriefRepository(good as never).get('p1')).toEqual(stored());
  });
});

describe('BriefService.generate', () => {
  it('AC-4: makes exactly one completeStructured call with maxRetries 0 and the resolved model', async () => {
    const t = make();
    await t.svc.generate('w', 'p1', t.model);
    expect(t.complete).toHaveBeenCalledTimes(1);
    const req = t.complete.mock.calls[0]![0] as { maxRetries: number; model: string; messages: { content: string }[] };
    expect(req.maxRetries).toBe(0);
    expect(req.model).toBe('feature-model');
    expect(t.llmFor).toHaveBeenCalledWith('openrouter');
    expect(req.messages[1]!.content).not.toContain('\n+x');
  });

  it('AC-8: stores head_sha, usage, missing_inputs and writes a null-agent agent_runs row', async () => {
    const t = make();
    const res = await t.svc.generate('w', 'p1', t.model);
    expect(res).toMatchObject({
      head_sha: 'sha-new', model: 'resolved', tokens_in: 700, tokens_out: 90, cost_usd: 0.01,
      generated_at: '2026-10-04T12:00:00.000Z', stale: false,
    });
    expect(t.upsert).toHaveBeenCalledTimes(1);
    expect(t.cache()?.missing_inputs).toEqual(['intent', 'linked_issue', 'specs']);
    expect(t.createAgentRun).toHaveBeenCalledWith(expect.objectContaining({ agentId: null, prId: 'p1', workspaceId: 'w' }));
    expect(t.completeAgentRun).toHaveBeenCalledWith('run1', expect.objectContaining({ status: 'done', tokensIn: 700, costUsd: 0.01 }));
  });

  it('AC-9, AC-10, AC-11, AC-12: post-validates the model output before caching', async () => {
    const t = make();
    const res = await t.svc.generate('w', 'p1', t.model);
    expect(res.risks.map((r) => r.title)).toEqual(['Retry storm']);
    expect(res.review_focus).toEqual([
      { file: 'src/a.ts', line: 11, reason: 'in range' },
      { file: 'src/a.ts', line: null, reason: 'out of range' },
    ]);
    const empty = make({ complete: vi.fn(async () => llmResult({ summary: 's', risks: [], review_focus: [] })) });
    const r2 = await empty.svc.generate('w', 'p1', empty.model);
    expect(r2.risks).toEqual([]);
    expect(empty.upsert).toHaveBeenCalledTimes(1);
  });

  it('AC-13: absent intent still generates and is listed, and intent is never derived', async () => {
    const t = make();
    const res = await t.svc.generate('w', 'p1', t.model);
    expect(res.missing_inputs).toContain('intent');
    expect(t.complete).toHaveBeenCalledTimes(1);
  });

  it('AC-14: a failing blast still generates and reports blast; a degraded one adds degraded_blast', async () => {
    const failing = make({ blast: async () => { throw new Error('boom'); } });
    expect((await failing.svc.generate('w', 'p1', failing.model)).missing_inputs).toContain('blast');
    const degraded = make({
      blast: async () => ({ changed_symbols: [], downstream: [], summary: 'none', degraded: true, reason: 'no_data' }),
    });
    const res = await degraded.svc.generate('w', 'p1', degraded.model);
    expect(res.missing_inputs).toEqual(expect.arrayContaining(['blast', 'degraded_blast']));
    expect(degraded.complete).toHaveBeenCalledTimes(1);
  });

  it('AC-15: unfetchable issue, no specs and blank description are listed; present ones are not', async () => {
    const t = make({ issue: { state: 'unavailable' }, pull: { ...pull, body: ' ' } });
    expect((await t.svc.generate('w', 'p1', t.model)).missing_inputs).toEqual(
      expect.arrayContaining(['linked_issue', 'specs', 'description']),
    );
    const full = make({
      issue: { state: 'fetched', issue: { number: 1, title: 't', body: 'b' } } as never,
      specs: [{ source: 'specs/a.md', text: 'spec' }],
      intent: { intent: 'i', in_scope: [], out_of_scope: [], category: 'feat', confidence: 0.5 },
    });
    expect((await full.svc.generate('w', 'p1', full.model)).missing_inputs).toEqual([]);
  });

  it('AC-16: a model failure returns an error without leaking it and leaves the cached brief unchanged', async () => {
    const t = make({ stored: stored(), complete: vi.fn(async () => { throw new Error('provider exploded: sk-secret'); }) });
    const err = await t.svc.generate('w', 'p1', t.model).catch((e) => e);
    expect(err).toMatchObject({ code: 'brief_generation_failed', statusCode: 502 });
    expect(err.message).not.toContain('sk-secret');
    expect(t.upsert).not.toHaveBeenCalled();
    expect(t.cache()).toEqual(stored());
    expect(t.completeAgentRun).toHaveBeenCalledWith('run1', expect.objectContaining({ status: 'failed' }));
  });

  it('AC-16: output failing zod validation is an error too and caches nothing', async () => {
    const t = make({
      complete: vi.fn(async () => { throw new Error('LLM output failed schema validation'); }),
    });
    await expect(t.svc.generate('w', 'p1', t.model)).rejects.toMatchObject({ code: 'brief_generation_failed' });
    expect(t.upsert).not.toHaveBeenCalled();
  });

  it('AC-17: concurrent POSTs for one PR join a single model call; the next one after settling runs again', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const complete = vi.fn(async () => { await gate; return llmResult(); });
    const t = make({ complete });
    const a = t.svc.generate('w', 'p1', t.model);
    const b = t.svc.generate('w', 'p1', t.model);
    expect(b).toBe(a);
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(rb).toEqual(ra);
    expect(complete).toHaveBeenCalledTimes(1);
    await t.svc.generate('w', 'p1', t.model);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('AC-17: the in-flight key includes the workspace, so another workspace cannot join', async () => {
    const t = make();
    t.reviewRepo.getPull.mockImplementation(async (ws: string) => (ws === 'w' ? pull : (undefined as never)));
    const a = t.svc.generate('w', 'p1', t.model);
    const other = t.svc.generate('other', 'p1', t.model);
    expect(other).not.toBe(a);
    await expect(other).rejects.toBeInstanceOf(NotFoundError);
    await a;
  });

  it('NFR-5: logs one line per generation with model, tokens, cost and dropped counts', async () => {
    const t = make();
    await t.svc.generate('w', 'p1', t.model);
    const lines = t.logs.filter((l) => l.msg === 'brief.generate');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.obj).toMatchObject({
      model: 'resolved', tokens_in: 700, tokens_out: 90, cost_usd: 0.01,
      dropped_risks: 1, dropped_focus: 0, cleared_lines: 1, outcome: 'success',
    });
    expect(JSON.stringify(lines[0]!.obj)).not.toContain('Adds retries');
  });
});
