import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import { EXTRACTION_SCHEMA_NAME } from '../src/modules/conventions/prompt.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

/**
 * The conventions extractor end to end. The point under test is the EVIDENCE
 * GATE: the mock model returns one candidate it can prove and one it invented,
 * and only the provable one is allowed to reach the database.
 */

const USERS_TS = `import { db } from '../lib/db';

export async function getUser(id: string) {
  const user = await db.users.find(id);
  return user;
}
`;

const GROUNDED = {
  rule: 'Always use async/await instead of .then() chains',
  evidence_path: 'src/api/users.ts',
  // Deliberately wrong: a miscounted gutter is a formatting slip, and the gate
  // corrects it rather than throwing the rule away.
  evidence_line: 40,
  evidence_snippet: 'const user = await db.users.find(id);',
  rationale: 'Flag a .then() chain added to an async function.',
  occurrences: 3,
  category: 'async' as const,
  confidence: 0.91,
};

const HALLUCINATED = {
  rule: 'All repositories extend BaseRepository',
  evidence_path: 'src/api/users.ts',
  evidence_line: 2,
  evidence_snippet: 'export class UserRepository extends BaseRepository {',
  rationale: 'Flag a repository that does not extend the base class.',
  occurrences: 5,
  category: 'structure' as const,
  confidence: 0.95,
};

d('conventions extractor', () => {
  let pg: PgFixture;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  beforeEach(async () => {
    await pg.handle.db.delete(t.conventions).where(eq(t.conventions.repoId, repoId));
    await pg.handle.db
      .update(t.repos)
      .set({ clonePath: '/mock/clones/acme/payments-api' })
      .where(eq(t.repos.id, repoId));
  });

  /** A RepoIntel that only answers the one question the extractor asks it. */
  function repoIntelWith(paths: string[]): RepoIntel {
    return { getConventionSamples: async () => paths } as unknown as RepoIntel;
  }

  function makeApp(conventions: unknown[], opts: { files?: Record<string, string> } = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        github: new MockGitHubClient(),
        git: new MockGitClient({
          files: opts.files ?? { 'src/api/users.ts': USERS_TS },
        }),
        repoIntel: repoIntelWith(['src/api/users.ts']),
        llm: {
          openai: new MockLLMProvider('openai', {
            structuredBySchema: { [EXTRACTION_SCHEMA_NAME]: { conventions } },
          }),
        },
      },
    });
  }

  async function extract(app: Awaited<ReturnType<typeof makeApp>>) {
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  it('keeps the provable candidate, DROPS the invented one, and reports both counts', async () => {
    const app = await makeApp([GROUNDED, HALLUCINATED]);
    const out = await extract(app);

    expect(out.proposed).toBe(2);
    expect(out.dropped_ungrounded).toBe(1);
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0].rule).toBe(GROUNDED.rule);
    expect(out.sampled_files).toContain('src/api/users.ts');
  });

  it('corrects the cited line to where the snippet actually is', async () => {
    const app = await makeApp([GROUNDED]);
    const out = await extract(app);
    expect(out.candidates[0].evidence_line).toBe(4);
  });

  it('persists nothing for the invented candidate', async () => {
    const app = await makeApp([GROUNDED, HALLUCINATED]);
    await extract(app);
    const rows = await pg.handle.db
      .select()
      .from(t.conventions)
      .where(eq(t.conventions.repoId, repoId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('pending');
  });

  it('refuses to call the model at all when the repo is not cloned', async () => {
    await pg.handle.db.update(t.repos).set({ clonePath: null }).where(eq(t.repos.id, repoId));
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: { [EXTRACTION_SCHEMA_NAME]: { conventions: [GROUNDED] } },
    });
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        github: new MockGitHubClient(),
        git: new MockGitClient(),
        repoIntel: repoIntelWith([]),
        llm: { openai: llm },
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(res.statusCode).toBe(422);
    expect(llm.calls).toHaveLength(0);
  });

  it('422s when the clone has no readable files, before spending a call', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: { [EXTRACTION_SCHEMA_NAME]: { conventions: [GROUNDED] } },
    });
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        github: new MockGitHubClient(),
        git: new MockGitClient({ files: {} }),
        repoIntel: repoIntelWith([]),
        llm: { openai: llm },
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(res.statusCode).toBe(422);
    expect(llm.calls).toHaveLength(0);
  });

  it('accepts, edits and deletes a candidate', async () => {
    const app = await makeApp([GROUNDED]);
    const { candidates } = await extract(app);
    const id = candidates[0].id;

    const accepted = await app.inject({
      method: 'PATCH',
      url: `/conventions/${id}`,
      payload: { status: 'accepted', rule: 'Use async/await, never .then() chains' },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().status).toBe('accepted');
    expect(accepted.json().rule).toBe('Use async/await, never .then() chains');

    const removed = await app.inject({ method: 'DELETE', url: `/conventions/${id}` });
    expect(removed.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json())
      .toHaveLength(0);
  });

  it('a re-scan keeps decided rows and does not re-propose a rejected rule', async () => {
    const app = await makeApp([GROUNDED]);
    const first = await extract(app);
    await app.inject({
      method: 'PATCH',
      url: `/conventions/${first.candidates[0].id}`,
      payload: { status: 'rejected' },
    });

    const second = await extract(app);
    expect(second.dropped_duplicate).toBe(1);
    expect(second.candidates).toHaveLength(1);
    expect(second.candidates[0].status).toBe('rejected');
  });

  it('builds a skill draft from the accepted set WITHOUT persisting a skill', async () => {
    const app = await makeApp([GROUNDED]);
    const { candidates } = await extract(app);
    await app.inject({
      method: 'PATCH',
      url: `/conventions/${candidates[0].id}`,
      payload: { status: 'accepted' },
    });

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill` });
    expect(res.statusCode).toBe(200);
    const draft = res.json();
    expect(draft.name).toBe('payments-api-conventions');
    expect(draft.type).toBe('convention');
    expect(draft.body).toContain('`src/api/users.ts:4`');

    const skills = await pg.handle.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.name, 'payments-api-conventions')));
    expect(skills).toHaveLength(0);
  });

  it('refuses a draft when nothing has been accepted', async () => {
    const app = await makeApp([GROUNDED]);
    await extract(app);
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill` });
    expect(res.statusCode).toBe(422);
  });
});
