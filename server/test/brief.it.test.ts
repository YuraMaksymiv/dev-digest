import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { StructuredRequest, StructuredResult } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const GOOD_OUTPUT = {
  summary: 'Adds rate limiting to the charge endpoint.',
  risks: [
    { kind: 'concurrency', title: 'Shared counter', explanation: 'e', severity: 'high', file_refs: ['src/limit.ts'] },
    { kind: 'invented', title: 'Ghost', explanation: 'e', severity: 'low', file_refs: ['src/ghost.ts'] },
  ],
  review_focus: [
    { file: 'src/limit.ts', line: 12, reason: 'window maths' },
    { file: 'src/limit.ts', line: 900, reason: 'line outside any hunk' },
    { file: 'src/ghost.ts', line: null, reason: 'not a PR file' },
  ],
};

class BriefProvider extends MockLLMProvider {
  constructor(private behavior: { fail?: Error; delayMs?: number } = {}) {
    super('openrouter');
  }
  get structuredCalls() {
    return this.calls.filter((c) => c.method === 'completeStructured');
  }
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    if (this.behavior.delayMs) await new Promise((r) => setTimeout(r, this.behavior.delayMs));
    if (this.behavior.fail) throw this.behavior.fail;
    const data = (req.schema as { parse(v: unknown): T }).parse(GOOD_OUTPUT);
    return { data, model: req.model, tokensIn: 900, tokensOut: 120, costUsd: 0.0042, raw: '', attempts: 1 };
  }
}

d('PR Brief (Testcontainers pg, mock provider)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function newPr(headSha = 'sha-1') {
    const db = pg.handle.db;
    const name = `brief-api-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId, repoId: repo!.id, number: 1, title: 'Add rate limiting', author: 'a', branch: 'feat/rl',
        base: 'main', headSha, additions: 4, deletions: 0, filesCount: 1, status: 'needs_review', body: 'Adds limiter.',
      })
      .returning();
    await db.insert(t.prFiles).values({
      prId: pr!.id, path: 'src/limit.ts', additions: 4, deletions: 0,
      patch: '@@ -10,2 +10,5 @@\n+const SECRET_BODY = 1;',
    });
    return pr!;
  }

  async function appFor(provider: BriefProvider) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient(),
        llm: { openrouter: provider, openai: provider, anthropic: provider },
      },
    });
  }

  const storedRows = (prId: string) => pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
  const runRows = (prId: string) => pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, prId));
  const uuid = '00000000-0000-4000-8000-0000000000aa';

  it('AC-2: GET without a brief returns 200 null and makes no model call', async () => {
    const pr = await newPr();
    const provider = new BriefProvider();
    const app = await appFor(provider);
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
    expect(provider.calls).toHaveLength(0);
    await app.close();
  });

  it('AC-3: unknown (well-formed) PR id gives 404 for GET and POST', async () => {
    const app = await appFor(new BriefProvider());
    expect((await app.inject({ method: 'GET', url: `/pulls/${uuid}/brief` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/pulls/${uuid}/brief` })).statusCode).toBe(404);
    await app.close();
  });

  it('AC-4, AC-8, AC-9, AC-10, AC-11: POST makes one call (maxRetries 0), validates, stores, and writes a null-agent run', async () => {
    const pr = await newPr('sha-1');
    const provider = new BriefProvider();
    const app = await appFor(provider);
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(provider.structuredCalls).toHaveLength(1);
    const req = provider.structuredCalls[0]!.req as StructuredRequest<unknown>;
    expect(req.maxRetries).toBe(0);
    expect(req.messages.map((m) => m.content).join('\n')).not.toContain('SECRET_BODY');
    expect(body).toMatchObject({ head_sha: 'sha-1', tokens_in: 900, tokens_out: 120, cost_usd: 0.0042, stale: false });
    expect(body.risks.map((r: { title: string }) => r.title)).toEqual(['Shared counter']);
    expect(body.review_focus).toEqual([
      { file: 'src/limit.ts', line: 12, reason: 'window maths' },
      { file: 'src/limit.ts', line: null, reason: 'line outside any hunk' },
    ]);
    expect(body.missing_inputs).toEqual(expect.arrayContaining(['intent', 'specs']));

    const rows = await storedRows(pr.id);
    expect(rows).toHaveLength(1);
    expect((rows[0]!.json as { head_sha: string }).head_sha).toBe('sha-1');
    const runs = await runRows(pr.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ agentId: null, status: 'done', costUsd: 0.0042, tokensIn: 900 });

    const listed = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json();
    expect(listed).toEqual([]);
    await app.close();
  });

  it('AC-1: GET returns the cached brief, stale when the head moved, without a model call', async () => {
    const pr = await newPr('sha-1');
    const provider = new BriefProvider();
    const app = await appFor(provider);
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    provider.calls.length = 0;
    const fresh = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` })).json();
    expect(fresh).toMatchObject({ stale: false, head_sha: 'sha-1' });
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'sha-2' }).where(eq(t.pullRequests.id, pr.id));
    const stale = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` })).json();
    expect(stale.stale).toBe(true);
    expect(provider.calls).toHaveLength(0);
    await app.close();
  });

  it('NFR-4: a stored row in an unknown shape is served as no brief', async () => {
    const pr = await newPr();
    await pg.handle.db.insert(t.prBrief).values({ prId: pr.id, json: { intent: {}, blast: {}, risks: {}, history: [] } });
    const app = await appFor(new BriefProvider());
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
    await app.close();
  });

  it('AC-16: a provider failure returns an error and leaves the cached brief unchanged', async () => {
    const pr = await newPr('sha-1');
    const ok = await appFor(new BriefProvider());
    await ok.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    const before = await storedRows(pr.id);
    await ok.close();

    const app = await appFor(new BriefProvider({ fail: new Error('provider down') }));
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(res.json())).not.toContain('provider down');
    expect(await storedRows(pr.id)).toEqual(before);
    const failed = (await runRows(pr.id)).filter((r) => r.status === 'failed');
    expect(failed).toHaveLength(1);
    await app.close();
  });

  it('AC-17: concurrent POSTs for one PR make a single model call', async () => {
    const pr = await newPr();
    const provider = new BriefProvider({ delayMs: 150 });
    const app = await appFor(provider);
    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` }),
      app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` }),
    ]);
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(provider.structuredCalls).toHaveLength(1);
    expect(await storedRows(pr.id)).toHaveLength(1);
    await app.close();
  });

  it('AC-8: the null-agent brief run does not leak into the PR run list or the PR list cost rollup', async () => {
    const pr = await newPr();
    const app = await appFor(new BriefProvider());
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(await runRows(pr.id)).toHaveLength(1);
    expect((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json()).toEqual([]);
    expect((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs/active` })).json()).toEqual([]);
    const list = (await app.inject({ method: 'GET', url: `/repos/${pr.repoId}/pulls` })).json();
    expect(list.find((p: { id: string }) => p.id === pr.id).cost_usd).toBeNull();
    await app.close();
  });
});
