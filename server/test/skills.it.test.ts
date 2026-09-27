import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
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
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * The `/skills` module: CRUD, the usage count, workspace scoping, and the
 * version rule — a CONTENT change snapshots a version, toggling `enabled` does
 * not.
 */
d('/skills', () => {
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

  const createBody = {
    name: 'test-only-skill',
    description: 'When the diff changes logic, check the branches.',
    type: 'custom' as const,
    body: 'Original body.',
  };

  async function createSkill(app: Awaited<ReturnType<typeof makeApp>>, over = {}) {
    const payload = {
      ...createBody,
      name: `skill-${Math.random().toString(36).slice(2)}`,
      ...over,
    };
    const res = await app.inject({ method: 'POST', url: '/skills', payload });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string; version: number };
  }

  it('creates a skill at version 1 with a v1 body snapshot', async () => {
    const app = await makeApp();
    const created = await createSkill(app);
    expect(created).toMatchObject({ version: 1, source: 'manual', enabled: true });

    const versions = await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` });
    expect(versions.json()).toHaveLength(1);
    expect(versions.json()[0]).toMatchObject({ version: 1, body: 'Original body.' });
    await app.close();
  });

  it('lists the seeded skills with a used_by count', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/skills' });
    expect(res.statusCode).toBe(200);
    const list = res.json() as Array<{ name: string; used_by: number }>;

    const seeded = list.find((s) => s.name === 'pr-quality-rubric');
    expect(seeded).toBeDefined();
    // Seeded skills are linked to the Security Reviewer.
    expect(seeded!.used_by).toBe(1);
    // A skill nothing links reports 0, not null.
    const created = await createSkill(app);
    const after = await app.inject({ method: 'GET', url: '/skills' });
    const fresh = (after.json() as Array<{ id: string; used_by: number }>).find(
      (s) => s.id === created.id,
    );
    expect(fresh!.used_by).toBe(0);
    await app.close();
  });

  it('bumps the version and appends a snapshot when the body changes', async () => {
    const app = await makeApp();
    const created = await createSkill(app);

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { body: 'Rewritten body.' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);

    const versions = await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` });
    // Newest first.
    expect(versions.json().map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions.json()[0].body).toBe('Rewritten body.');
    await app.close();
  });

  it('does NOT bump the version when only `enabled` is toggled', async () => {
    const app = await makeApp();
    const created = await createSkill(app);

    const off = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { enabled: false },
    });
    expect(off.json()).toMatchObject({ enabled: false, version: 1 });

    const versions = await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` });
    expect(versions.json()).toHaveLength(1);
    await app.close();
  });

  it('does NOT bump the version when a patch repeats the existing values', async () => {
    const app = await makeApp();
    const created = await createSkill(app);
    const res = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { body: 'Original body.', name: created.name, type: createBody.type },
    });
    expect(res.json().version).toBe(1);
    await app.close();
  });

  it('answers 404 (not 403) for a skill in another workspace', async () => {
    const app = await makeApp();
    const [other] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-${Math.random().toString(36).slice(2)}` })
      .returning();
    const [foreign] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId: other!.id,
        name: 'foreign-skill',
        description: 'Not ours.',
        type: 'custom',
        source: 'manual',
        body: 'x',
      })
      .returning();

    for (const url of [
      `/skills/${foreign!.id}`,
      `/skills/${foreign!.id}/versions`,
      `/skills/${foreign!.id}/agents`,
    ]) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(404);
    }
    const put = await app.inject({
      method: 'PUT',
      url: `/skills/${foreign!.id}`,
      payload: { body: 'hijacked' },
    });
    expect(put.statusCode).toBe(404);
    await app.close();
  });

  it('rejects an unknown skill type with a 422 rather than writing it', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...createBody, name: 'bad-type', type: 'not-a-type' },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('cascades versions and agent links on delete', async () => {
    const app = await makeApp();
    const created = await createSkill(app);
    const [agent] = await pg.handle.db.select().from(t.agents).limit(1);
    await app.inject({
      method: 'POST',
      url: `/agents/${agent!.id}/skills`,
      payload: { skill_id: created.id },
    });

    const del = await app.inject({ method: 'DELETE', url: `/skills/${created.id}` });
    expect(del.json()).toEqual({ ok: true });

    const versions = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, created.id));
    expect(versions).toHaveLength(0);
    const links = await pg.handle.db
      .select()
      .from(t.agentSkills)
      .where(eq(t.agentSkills.skillId, created.id));
    expect(links).toHaveLength(0);

    expect((await app.inject({ method: 'DELETE', url: `/skills/${created.id}` })).statusCode).toBe(
      404,
    );
    await app.close();
  });

  it('names the agents linking a skill', async () => {
    const app = await makeApp();
    const list = (await app.inject({ method: 'GET', url: '/skills' })).json() as Array<{
      id: string;
      name: string;
    }>;
    const rubric = list.find((s) => s.name === 'pr-quality-rubric')!;
    const res = await app.inject({ method: 'GET', url: `/skills/${rubric.id}/agents` });
    expect(res.json()).toEqual([
      expect.objectContaining({ name: 'Security Reviewer' }),
    ]);
    await app.close();
  });
});
