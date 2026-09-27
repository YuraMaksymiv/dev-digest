import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-links] Docker not available — skipping integration tests.');
}

/**
 * The agent side of the link: the ordered set, the PER-AGENT enabled flag, and
 * D7 — a link change bumps the agent's config version and snapshots only the
 * links that were enabled (i.e. the ones that actually shaped the prompt).
 */
d('POST /agents/:id/skills', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  type App = Awaited<ReturnType<typeof makeApp>>;

  async function newAgent(app: App) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Linker ${Math.random().toString(36).slice(2)}`,
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'Review the diff.',
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; version: number };
  }

  async function newSkill(app: App, body = 'Rule.') {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: `sk-${Math.random().toString(36).slice(2)}`,
        description: 'When X, do Y.',
        type: 'custom',
        body,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string };
  }

  it('sets the ordered set with a per-agent enabled flag and reads it back', async () => {
    const app = await makeApp();
    const agent = await newAgent(app);
    const [a, b, c] = [await newSkill(app), await newSkill(app), await newSkill(app)];

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: {
        skills: [
          { skill_id: c.id, enabled: true },
          { skill_id: a.id, enabled: false },
          { skill_id: b.id, enabled: true },
        ],
      },
    });
    expect(res.statusCode).toBe(200);

    const detail = (await app.inject({
      method: 'GET',
      url: `/agents/${agent.id}/skills`,
    })).json() as Array<{ id: string; name: string; order: number; link_enabled: boolean }>;

    // GET returns the skill's own fields too, so the tab needs no second call.
    expect(detail.map((r) => [r.id, r.order, r.link_enabled])).toEqual([
      [c.id, 0, true],
      [a.id, 1, false],
      [b.id, 2, true],
    ]);
    expect(detail[0]!.name).toBe(c.name);
    await app.close();
  });

  it('still accepts the older skill_ids form, meaning "all enabled, in this order"', async () => {
    const app = await makeApp();
    const agent = await newAgent(app);
    const [a, b] = [await newSkill(app), await newSkill(app)];

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [b.id, a.id] },
    });
    expect(res.json()).toEqual([
      expect.objectContaining({ skill_id: b.id, order: 0, enabled: true }),
      expect.objectContaining({ skill_id: a.id, order: 1, enabled: true }),
    ]);
    await app.close();
  });

  it('bumps the agent version on a link change and snapshots ONLY the enabled links', async () => {
    const app = await makeApp();
    const agent = await newAgent(app);
    expect(agent.version).toBe(1);
    const [on, off] = [await newSkill(app), await newSkill(app)];

    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: {
        skills: [
          { skill_id: on.id, enabled: true },
          { skill_id: off.id, enabled: false },
        ],
      },
    });

    const after = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
    expect(after.version).toBe(2);

    const versions = (await app.inject({
      method: 'GET',
      url: `/agents/${agent.id}/versions`,
    })).json() as Array<{ version: number; config: { skills: string[] } }>;
    const v2 = versions.find((v) => v.version === 2)!;
    // The muted link shaped no prompt, so it is not part of what v2 means.
    expect(v2.config.skills).toEqual([on.id]);
    await app.close();
  });

  it('rejects a skill from another workspace with 422, leaving the links untouched', async () => {
    const app = await makeApp();
    const agent = await newAgent(app);
    const mine = await newSkill(app);
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skills: [{ skill_id: mine.id }] },
    });

    const [other] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-${Math.random().toString(36).slice(2)}` })
      .returning();
    const [foreign] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId: other!.id,
        name: 'foreign',
        description: 'Not ours.',
        type: 'custom',
        source: 'manual',
        body: 'x',
      })
      .returning();

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skills: [{ skill_id: foreign!.id }] },
    });
    // The agent exists; it is the body that names something invisible here.
    expect(res.statusCode).toBe(422);

    const links = await pg.handle.db
      .select()
      .from(t.agentSkills)
      .where(eq(t.agentSkills.agentId, agent.id));
    expect(links.map((l) => l.skillId)).toEqual([mine.id]);
    await app.close();
  });

  it('reproduces the seeded Security Reviewer: 3 of 6 skills enabled, in order', async () => {
    const app = await makeApp();
    const [agent] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(eq(t.agents.name, 'Security Reviewer'));

    const detail = (await app.inject({
      method: 'GET',
      url: `/agents/${agent!.id}/skills`,
    })).json() as Array<{ name: string; link_enabled: boolean }>;

    expect(detail.map((r) => r.name)).toEqual([
      'pr-quality-rubric',
      'secret-leakage-gate',
      'lethal-trifecta',
      'no-then-chains',
      'phantom-api-gate',
      'test-coverage-nudge',
    ]);
    expect(detail.filter((r) => r.link_enabled)).toHaveLength(3);
    await app.close();
  });

  it('keeps a globally disabled skill out of the prompt set even when the link is on', async () => {
    const app = await makeApp();
    const agent = await newAgent(app);
    const muted = await newSkill(app);
    const live = await newSkill(app);

    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: {
        skills: [{ skill_id: muted.id, enabled: true }, { skill_id: live.id, enabled: true }],
      },
    });
    await app.inject({ method: 'PUT', url: `/skills/${muted.id}`, payload: { enabled: false } });

    // The link row is untouched — only the prompt set narrows.
    const [link] = await pg.handle.db
      .select()
      .from(t.agentSkills)
      .where(and(eq(t.agentSkills.agentId, agent.id), eq(t.agentSkills.skillId, muted.id)));
    expect(link!.enabled).toBe(true);

    const detail = (await app.inject({
      method: 'GET',
      url: `/agents/${agent.id}/skills`,
    })).json() as Array<{ id: string; enabled: boolean; link_enabled: boolean }>;
    const row = detail.find((r) => r.id === muted.id)!;
    expect(row).toMatchObject({ enabled: false, link_enabled: true });
    await app.close();
  });
});
