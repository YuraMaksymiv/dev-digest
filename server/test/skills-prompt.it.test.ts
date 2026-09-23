import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-prompt] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'comment',
  summary: 'Nothing blocking.',
  score: 90,
  findings: [],
};

/**
 * The end of the wire: a linked, enabled skill becomes a `### name` block inside
 * the prompt's `## Skills / rules` section, and an agent with none produces a
 * prompt byte-identical to the pre-L02 one.
 */
d('skills reach the assembled prompt', () => {
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

  function makeApp() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
  }

  type App = Awaited<ReturnType<typeof makeApp>>;

  async function setupPr() {
    const name = `payments-api-skills-${repoSeq++}`;
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

  async function newAgent(app: App) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Prompt Agent ${Math.random().toString(36).slice(2)}`,
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a reviewer.',
        // Keep repo-intel out of it so the prompt is the diff + skills only.
        repo_intel: false,
      },
    });
    return res.json() as { id: string };
  }

  async function newSkill(app: App, name: string, body: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name, description: 'When X, do Y.', type: 'custom', body },
    });
    return res.json() as { id: string };
  }

  /** Run the agent on a fresh PR and return the persisted prompt assembly. */
  async function assemblyFor(app: App, agentId: string) {
    const pr = await setupPr();
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId },
    });
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    return trace.prompt_assembly as { skills: string | null; user: string };
  }

  it('renders enabled skills as `### name` blocks, in link order, and nothing else', async () => {
    const app = await makeApp();
    const agent = await newAgent(app);
    const sk = `s${Math.random().toString(36).slice(2, 7)}`;
    const first = await newSkill(app, `${sk}-first`, 'First rule.');
    const second = await newSkill(app, `${sk}-second`, 'Second rule.');
    const muted = await newSkill(app, `${sk}-muted`, 'Muted rule.');

    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: {
        skills: [
          { skill_id: second.id, enabled: true },
          { skill_id: first.id, enabled: true },
          { skill_id: muted.id, enabled: false },
        ],
      },
    });

    const assembly = await assemblyFor(app, agent.id);
    // Link order, not creation order.
    expect(assembly.skills).toBe(`### ${sk}-second\nSecond rule.\n\n### ${sk}-first\nFirst rule.`);
    expect(assembly.user).toContain('## Skills / rules');
    expect(assembly.skills).not.toContain('Muted rule.');
    await app.close();
  });

  it('drops the block when the per-agent link is muted', async () => {
    const app = await makeApp();
    const agent = await newAgent(app);
    const only = await newSkill(app, `s${Math.random().toString(36).slice(2, 7)}`, 'Only rule.');

    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skills: [{ skill_id: only.id, enabled: true }] },
    });
    expect((await assemblyFor(app, agent.id)).skills).toContain('Only rule.');

    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skills: [{ skill_id: only.id, enabled: false }] },
    });
    expect((await assemblyFor(app, agent.id)).skills).toBeNull();
    await app.close();
  });

  it('drops the block when the skill is disabled globally', async () => {
    const app = await makeApp();
    const agent = await newAgent(app);
    const only = await newSkill(app, `s${Math.random().toString(36).slice(2, 7)}`, 'Global rule.');
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skills: [{ skill_id: only.id, enabled: true }] },
    });

    await app.inject({ method: 'PUT', url: `/skills/${only.id}`, payload: { enabled: false } });
    expect((await assemblyFor(app, agent.id)).skills).toBeNull();
    await app.close();
  });

  it('leaves the prompt byte-identical for an agent with no skills', async () => {
    const app = await makeApp();
    const bare = await newAgent(app);
    const baseline = await assemblyFor(app, bare.id);
    expect(baseline.skills).toBeNull();
    expect(baseline.user).not.toContain('## Skills / rules');

    // Link then unlink: the assembly must return to exactly the same string, so
    // the feature is a true no-op for an agent that uses none.
    const only = await newSkill(app, `s${Math.random().toString(36).slice(2, 7)}`, 'Temp rule.');
    await app.inject({
      method: 'POST',
      url: `/agents/${bare.id}/skills`,
      payload: { skills: [{ skill_id: only.id, enabled: true }] },
    });
    await app.inject({
      method: 'POST',
      url: `/agents/${bare.id}/skills`,
      payload: { skills: [] },
    });

    expect((await assemblyFor(app, bare.id)).user).toBe(baseline.user);
    await app.close();
  });
});
