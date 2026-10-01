import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { PrRef, RunDetail, type Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

let seq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `lookup-api-${seq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('GET /runs/:id and GET /pulls/lookup (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(structured: unknown) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          openai: new MockLLMProvider('openai', { structured }),
          openrouter: new MockLLMProvider('openrouter'),
        },
      },
    });
  }

  async function createAgent(app: Awaited<ReturnType<typeof appWith>>, name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
    });
    return res.json() as { id: string; name: string };
  }

  it('running run: status running, no review yet', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr, repo } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await createAgent(app, 'Running Agent');
    const [run] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId, agentId: agent.id, prId: pr.id, status: 'running', source: 'local' })
      .returning();

    const res = await app.inject({ method: 'GET', url: `/runs/${run!.id}` });
    expect(res.statusCode).toBe(200);
    const body = RunDetail.parse(res.json());
    expect(body).toMatchObject({
      run_id: run!.id,
      status: 'running',
      agent_id: agent.id,
      agent_name: 'Running Agent',
      pr_id: pr.id,
      pr_number: 482,
      repo: repo.fullName,
      error: null,
      review_id: null,
    });
    await app.close();
  });

  it('done run: carries stats and the review_id of its kind=review row', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await createAgent(app, 'Done Agent');
    const started = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    const runId = started.runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })).json();
    const reviewRow = reviews.find((r: { run_id: string; kind: string }) => r.run_id === runId && r.kind === 'review');

    const res = await app.inject({ method: 'GET', url: `/runs/${runId}` });
    expect(res.statusCode).toBe(200);
    const body = RunDetail.parse(res.json());
    expect(body.status).toBe('done');
    expect(body.findings_count).toBe(1);
    expect(body.score).toBe(65);
    expect(body.error).toBeNull();
    expect(body.ran_at).not.toBeNull();
    expect(body.review_id).toBe(reviewRow.id);
    await app.close();
  });

  it('failed run: surfaces the error', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await createAgent(app, 'Failed Agent');
    const [run] = await pg.handle.db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        agentId: agent.id,
        prId: pr.id,
        status: 'failed',
        error: 'LLM quota exceeded',
        source: 'local',
      })
      .returning();

    const body = RunDetail.parse((await app.inject({ method: 'GET', url: `/runs/${run!.id}` })).json());
    expect(body.status).toBe('failed');
    expect(body.error).toBe('LLM quota exceeded');
    expect(body.review_id).toBeNull();
    await app.close();
  });

  it('404 for an unknown run id', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const res = await app.inject({
      method: 'GET',
      url: '/runs/00000000-0000-4000-8000-000000000000',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('404 for a run with agent_id NULL (intent classifier row)', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const [run] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId, agentId: null, prId: pr.id, status: 'done', source: 'local' })
      .returning();
    const res = await app.inject({ method: 'GET', url: `/runs/${run!.id}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('lookup hit: resolves repo + number without GitHub', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr, repo } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const res = await app.inject({
      method: 'GET',
      url: `/pulls/lookup?repo=${encodeURIComponent(repo.fullName)}&number=482`,
    });
    expect(res.statusCode).toBe(200);
    expect(PrRef.parse(res.json())).toEqual({
      pr_id: pr.id,
      repo_id: repo.id,
      repo: repo.fullName,
      number: 482,
      title: 'Add rate limiting',
      status: 'needs_review',
      head_sha: 'a1b2c3d4',
    });
    await app.close();
  });

  it('lookup 404 distinguishes repo-not-imported from PR-not-imported', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const noRepo = await app.inject({ method: 'GET', url: '/pulls/lookup?repo=ghost/nothing&number=1' });
    expect(noRepo.statusCode).toBe(404);
    expect(noRepo.json().error.message).toContain('Repo ghost/nothing is not imported');
    expect(noRepo.json().error.message).toContain('Import it in the DevDigest UI');

    const noPr = await app.inject({
      method: 'GET',
      url: `/pulls/lookup?repo=${encodeURIComponent(repo.fullName)}&number=9999`,
    });
    expect(noPr.statusCode).toBe(404);
    expect(noPr.json().error.message).toContain(`PR #9999 is not imported for ${repo.fullName}`);
    expect(noPr.json().error.message).toContain('Import it in the DevDigest UI');
    await app.close();
  });

  it.each([
    ['missing params', ''],
    ['repo without slash', '?repo=acme&number=1'],
    ['repo with extra segment', '?repo=a/b/c&number=1'],
    ['non-numeric number', '?repo=acme/x&number=abc'],
    ['zero number', '?repo=acme/x&number=0'],
    ['fractional number', '?repo=acme/x&number=1.5'],
  ])('lookup 400 on malformed query: %s', async (_label, qs) => {
    const app = await appWith(REVIEW_FIXTURE);
    const res = await app.inject({ method: 'GET', url: `/pulls/lookup${qs}` });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('routing: /pulls/lookup is not shadowed by /pulls/:id', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const res = await app.inject({ method: 'GET', url: '/pulls/lookup?repo=ghost/nothing&number=1' });
    // 404 with the lookup message (not a 422 uuid-param failure from /pulls/:id)
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
    await app.close();
  });
});
