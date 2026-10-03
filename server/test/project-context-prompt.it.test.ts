import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review, SpecDetail } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[project-context-prompt] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = { verdict: 'comment', summary: 'Nothing blocking.', score: 90, findings: [] };

const DETAIL: SpecDetail[] = [
  { path: 'specs/auth.md', tokens: 12, source: 'agent', source_name: 'Prompt Agent', status: 'read' },
  { path: 'docs/gone.md', tokens: 0, source: 'agent', source_name: 'Prompt Agent', status: 'missing' },
];

type Resolver = { resolve: (i: unknown) => Promise<unknown> };

d('project context reaches the assembled prompt and trace', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function makeApp(projectContext: Resolver) {
    const openai = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai, openrouter: new MockLLMProvider('openrouter') },
        projectContext: projectContext as never,
      },
    });
    return { app, openai };
  }

  async function setupPr() {
    const name = `payments-api-ctx-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
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
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    return pr!;
  }

  async function runOnce(resolver: Resolver) {
    const { app, openai } = await makeApp(resolver);
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Ctx Agent ${Math.random().toString(36).slice(2)}`,
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a reviewer.',
        repo_intel: false,
      },
    });
    const agent = res.json() as { id: string };
    const pr = await setupPr();
    const run = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    const runId = run.json().runs[0].run_id as string;
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    // completeAgentRun lands before saveRunTrace — poll for the trace row.
    let trace: any;
    for (let i = 0; i < 200 && !trace; i++) {
      const rows = await pg.handle.db.select().from(t.runTraces).where(eq(t.runTraces.runId, runId));
      if (rows.length > 0) trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
      else await new Promise((r) => setTimeout(r, 25));
    }
    await app.close();
    return { trace, status: runs[0]?.status, calls: openai.calls.filter((c) => c.method === 'completeStructured').length };
  }

  it('injects attached docs, persists specs_read/specs_detail, adds no provider calls', async () => {
    const base = await runOnce({ resolve: async () => ({ texts: [], specs_detail: [], specs_read: [] }) });
    const withCtx = await runOnce({
      resolve: async () => ({
        texts: [{ source: 'specs/auth.md', text: 'Auth must use PKCE.' }],
        specs_detail: DETAIL,
        specs_read: ['specs/auth.md'],
      }),
    });

    expect(withCtx.trace.prompt_assembly.user).toContain('Auth must use PKCE.');
    expect(withCtx.trace.prompt_assembly.specs).toContain('Auth must use PKCE.');
    expect(withCtx.trace.specs_read).toEqual(['specs/auth.md']);
    expect(withCtx.trace.specs_detail).toEqual(DETAIL);
    expect(withCtx.calls).toBe(base.calls);

    expect(base.trace.prompt_assembly.specs).toBeNull();
    expect(base.trace.specs_read).toEqual([]);
    expect(base.trace.specs_detail ?? null).toBeNull();
  });

  it('a resolver failure never fails the run', async () => {
    const out = await runOnce({
      resolve: async () => {
        throw new Error('boom');
      },
    });
    expect(out.status).toBe('done');
    expect(out.trace.specs_read).toEqual([]);
    expect(out.trace.prompt_assembly.specs).toBeNull();
  });
});
