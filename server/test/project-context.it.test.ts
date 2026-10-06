import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { ProjectContextRepository } from '../src/modules/project-context/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('project-context repository', () => {
  let pg: PgFixture;
  let repo: ProjectContextRepository;
  let workspaceId: string;
  let repoId: string;
  let agentA: string;
  let agentB: string;
  let skillId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const db = pg.handle.db;
    repo = new ProjectContextRepository(db);
    const [r] = await db.select().from(t.repos).limit(1);
    repoId = r!.id;
    workspaceId = r!.workspaceId;
    const agents = await db.select().from(t.agents).limit(2);
    agentA = agents[0]!.id;
    agentB = agents[1]!.id;
    const [s] = await db.select().from(t.skills).limit(1);
    skillId = s!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('replaces attachments transactionally and returns them ordered by position', async () => {
    await repo.replaceAttachments('agent', agentA, repoId, ['specs/b.md', 'docs/a.md', 'insights/c.md']);
    expect((await repo.getAttachments('agent', agentA, repoId)).map((r) => r.path)).toEqual([
      'specs/b.md',
      'docs/a.md',
      'insights/c.md',
    ]);
    await repo.replaceAttachments('agent', agentA, repoId, ['docs/a.md']);
    expect(await repo.getAttachments('agent', agentA, repoId)).toEqual([{ path: 'docs/a.md', position: 0 }]);
    await repo.replaceAttachments('agent', agentA, repoId, []);
    expect(await repo.getAttachments('agent', agentA, repoId)).toEqual([]);
  });

  it('counts distinct agents per path: direct plus via any skill link', async () => {
    await repo.replaceAttachments('agent', agentA, repoId, ['specs/x.md']);
    await repo.replaceAttachments('skill', skillId, repoId, ['specs/x.md', 'specs/y.md']);
    await pg.handle.db
      .insert(t.agentSkills)
      .values({ agentId: agentB, skillId })
      .onConflictDoNothing();
    const counts = await repo.usedByCounts(repoId);
    expect(counts.get('specs/x.md')).toBeGreaterThanOrEqual(2);
    expect(counts.get('specs/y.md')).toBeGreaterThanOrEqual(1);
  });

  it('scopes owner and repo lookups to the workspace', async () => {
    expect(await repo.getRepoInWorkspace(workspaceId, repoId)).toMatchObject({ id: repoId });
    expect(await repo.getRepoInWorkspace('00000000-0000-0000-0000-000000000000', repoId)).toBeNull();
    expect(await repo.ownerExists(workspaceId, 'agent', agentA)).toBe(true);
    expect(await repo.ownerExists('00000000-0000-0000-0000-000000000000', 'skill', skillId)).toBe(false);
  });

  it('AC-20: lists docs attached to enabled agents only, deduped by the caller, ordered', async () => {
    await repo.replaceAttachments('agent', agentA, repoId, ['specs/one.md', 'specs/shared.md']);
    await repo.replaceAttachments('agent', agentB, repoId, ['specs/shared.md']);
    await pg.handle.db.update(t.agents).set({ enabled: true }).where(inArray(t.agents.id, [agentA, agentB]));
    const both = (await repo.getEnabledAgentAttachments(repoId)).map((r) => r.path);
    expect(both).toEqual(expect.arrayContaining(['specs/one.md', 'specs/shared.md']));
    await pg.handle.db.update(t.agents).set({ enabled: false }).where(eq(t.agents.id, agentA));
    const afterDisable = (await repo.getEnabledAgentAttachments(repoId)).map((r) => r.path);
    expect(afterDisable).not.toContain('specs/one.md');
    expect(afterDisable).toContain('specs/shared.md');
    await pg.handle.db.update(t.agents).set({ enabled: true }).where(eq(t.agents.id, agentA));
    await repo.replaceAttachments('agent', agentA, repoId, []);
    await repo.replaceAttachments('agent', agentB, repoId, []);
  });

  it('groups skill attachments by skill id', async () => {
    await repo.replaceAttachments('skill', skillId, repoId, ['docs/z.md']);
    const grouped = await repo.getSkillAttachments([skillId], repoId);
    expect(grouped.get(skillId)?.map((r) => r.path)).toEqual(['docs/z.md']);
  });
});
