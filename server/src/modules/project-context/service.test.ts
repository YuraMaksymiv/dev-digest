import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectContextService } from './service.js';
import type { ProjectContextRepository } from './repository.js';
import { MAX_TOKENS_PER_DOC } from './constants.js';

let root: string;
let outside: string;
const warns: unknown[][] = [];

function makeService(over: Partial<Record<keyof ProjectContextRepository, unknown>> = {}) {
  const repo = {
    getRepoInWorkspace: async () => ({ id: 'r', owner: 'o', name: 'n' }),
    getRepoRef: async () => ({ id: 'r', owner: 'o', name: 'n' }),
    usedByCounts: async () => new Map([['specs/a.md', 2]]),
    getAttachments: async () => [],
    getSkillAttachments: async () => new Map(),
    getEnabledAgentAttachments: async () => [],
    ownerExists: async () => true,
    replaceAttachments: async () => {},
    ...over,
  } as unknown as ProjectContextRepository;
  return new ProjectContextService({
    repo,
    git: { clonePathFor: () => root },
    tokenizer: { count: (s) => Math.ceil(s.length / 4) },
    log: { info() {}, warn: (...a) => void warns.push(a) },
  });
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'pc-root-'));
  outside = await mkdtemp(join(tmpdir(), 'pc-out-'));
  await mkdir(join(root, 'specs'), { recursive: true });
  await mkdir(join(root, 'node_modules', 'docs'), { recursive: true });
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'specs', 'a.md'), 'hello world');
  await writeFile(join(root, 'specs', 'big.md'), 'x'.repeat(100 * 1024));
  await writeFile(join(root, 'specs', 'bin.md'), Buffer.from([65, 0, 66]));
  await writeFile(join(root, 'specs', 'note.txt'), 'nope');
  await writeFile(join(root, 'src', 'x.md'), 'not under a root');
  await writeFile(join(root, 'node_modules', 'docs', 'n.md'), 'ignored');
  await writeFile(join(outside, 'secret.md'), 'SECRET');
  await symlink(join(outside, 'secret.md'), join(root, 'specs', 'link.md'));
  await symlink(outside, join(root, 'specs', 'linkdir'));
  await mkdir(join(root, '.git', 'docs'), { recursive: true });
  await writeFile(join(root, '.git', 'config'), 'url = https://token@github.com/o/n');
  await writeFile(join(root, '.git', 'docs', 'inner.md'), 'GITSECRET');
  await symlink('../.git/config', join(root, 'specs', 'gitcfg.md'));
  await symlink('../.git/docs/inner.md', join(root, 'specs', 'gitdoc.md'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

describe('listDocs', () => {
  it('lists only qualifying docs, skips symlinks and ignored dirs, caps tokens', async () => {
    const res = await makeService().listDocs('w', 'r');
    expect(res.reason).toBeNull();
    expect(res.docs.map((d) => d.path)).toEqual(['specs/a.md', 'specs/big.md', 'specs/bin.md']);
    expect(res.docs[0]).toMatchObject({ root_type: 'specs', used_by: 2, tokens: 3, size_bytes: 11 });
    expect(res.docs[1]?.tokens).toBe(4000);
    expect(res.docs[2]?.tokens).toBe(0);
    expect(res.total_files).toBe(3);
    expect(res.truncated).toBe(false);
  });

  it('reports not_cloned when the clone is absent', async () => {
    const svc = new ProjectContextService({
      repo: { getRepoInWorkspace: async () => ({ id: 'r', owner: 'o', name: 'n' }) } as unknown as ProjectContextRepository,
      git: { clonePathFor: () => join(root, 'does-not-exist') },
      tokenizer: { count: () => 0 },
    });
    const res = await svc.listDocs('w', 'r');
    expect(res).toMatchObject({ docs: [], reason: 'not_cloned' });
  });
});

describe('readContent', () => {
  it('rejects traversal / non-qualifying paths with 400 invalid_path', async () => {
    for (const p of ['../x/specs/a.md', '/etc/passwd', 'src/x.md', 'specs/note.txt']) {
      await expect(makeService().readContent('w', 'r', p)).rejects.toMatchObject({ code: 'invalid_path', statusCode: 400 });
    }
  });
  it('AC-9: refuses a symlink escaping the clone with 400 invalid_path', async () => {
    await expect(makeService().readContent('w', 'r', 'specs/link.md')).rejects.toMatchObject({ code: 'invalid_path', statusCode: 400 });
    await expect(makeService().readContent('w', 'r', 'specs/linkdir/secret.md')).rejects.toMatchObject({ code: 'invalid_path', statusCode: 400 });
  });
  it('AC-9: refuses an in-clone symlink that targets .git with 400 invalid_path', async () => {
    await expect(makeService().readContent('w', 'r', 'specs/gitcfg.md')).rejects.toMatchObject({ code: 'invalid_path', statusCode: 400 });
    await expect(makeService().readContent('w', 'r', 'specs/gitdoc.md')).rejects.toMatchObject({ code: 'invalid_path', statusCode: 400 });
  });
  it('404s a missing file and reads a good one', async () => {
    await expect(makeService().readContent('w', 'r', 'specs/zzz.md')).rejects.toMatchObject({ statusCode: 404 });
    expect(await makeService().readContent('w', 'r', 'specs/a.md')).toEqual({ path: 'specs/a.md', content: 'hello world', tokens: 3 });
  });
});

describe('resolve', () => {
  it('orders agent before skills, dedups, flags missing/unreadable/truncated, never logs doc text', async () => {
    const svc = makeService({
      getAttachments: async () => [
        { path: 'specs/a.md', position: 0 },
        { path: 'specs/gone.md', position: 1 },
      ],
      getSkillAttachments: async () =>
        new Map([
          [
            's1',
            [
              { path: 'specs/a.md', position: 0 },
              { path: 'specs/big.md', position: 1 },
              { path: 'specs/link.md', position: 2 },
            ],
          ],
        ]),
    });
    const r = await svc.resolve({ agentId: 'a', skills: [{ id: 's1', name: 'Sk' }], repoId: 'r' });
    expect(r.specs_detail.map((d) => [d.path, d.status, d.source, d.source_name])).toEqual([
      ['specs/a.md', 'read', 'agent', null],
      ['specs/gone.md', 'missing', 'agent', null],
      ['specs/big.md', 'truncated', 'skill', 'Sk'],
      ['specs/link.md', 'unreadable', 'skill', 'Sk'],
    ]);
    expect(r.specs_read).toEqual(['specs/a.md', 'specs/big.md']);
    expect(r.texts[0]).toEqual({ source: 'specs/a.md', text: 'hello world', group: 'specs' });
  });

  it('AC-19: logs one info line per skipped doc without doc text', async () => {
    const infos: unknown[][] = [];
    const repo = {
      getRepoRef: async () => ({ id: 'r', owner: 'o', name: 'n' }),
      getAttachments: async () => [
        { path: 'specs/gone.md', position: 0 },
        { path: 'specs/bin.md', position: 1 },
        { path: 'specs/a.md', position: 2 },
      ],
      getSkillAttachments: async () => new Map(),
    } as unknown as ProjectContextRepository;
    const svc = new ProjectContextService({
      repo,
      git: { clonePathFor: () => root },
      tokenizer: { count: (s) => Math.ceil(s.length / 4) },
      log: { info: (...a) => void infos.push(a), warn() {} },
    });
    await svc.resolve({ agentId: 'a', skills: [], repoId: 'r' });
    const skipped = infos.filter((a) => a[1] === 'project-context doc skipped');
    expect(skipped.map((a) => a[0])).toEqual([
      { repoId: 'r', path: 'specs/gone.md', status: 'missing', source: 'agent' },
      { repoId: 'r', path: 'specs/bin.md', status: 'unreadable', source: 'agent' },
    ]);
  });

  it('AC-20: truncated doc text ends with [truncated] and stays within the cap', async () => {
    const svc = makeService({ getAttachments: async () => [{ path: 'specs/big.md', position: 0 }] });
    const r = await svc.resolve({ agentId: 'a', skills: [], repoId: 'r' });
    expect(r.specs_detail[0]?.status).toBe('truncated');
    expect(r.texts[0]?.text.endsWith('[truncated]')).toBe(true);
    expect(r.specs_detail[0]?.tokens).toBeLessThanOrEqual(MAX_TOKENS_PER_DOC);
  });

  it('is fail-soft and logs without doc text', async () => {
    warns.length = 0;
    const svc = makeService({ getAttachments: async () => { throw new Error('db down'); } });
    const r = await svc.resolve({ agentId: 'a', skills: [], repoId: 'r' });
    expect(r).toEqual({ texts: [], specs_detail: [], specs_read: [] });
    expect(warns).toHaveLength(1);
  });
});

describe('resolveForRepo', () => {
  it('AC-20: returns the deduped union of enabled-agent docs, flagging missing ones', async () => {
    const svc = makeService({
      getEnabledAgentAttachments: async () => [
        { path: 'specs/a.md', position: 0 },
        { path: 'specs/gone.md', position: 1 },
        { path: 'specs/a.md', position: 0 },
      ],
    });
    const r = await svc.resolveForRepo('r');
    expect(r.specs_read).toEqual(['specs/a.md']);
    expect(r.texts).toEqual([{ source: 'specs/a.md', text: 'hello world', group: 'specs' }]);
    expect(r.specs_detail.map((d) => [d.path, d.status])).toEqual([
      ['specs/a.md', 'read'],
      ['specs/gone.md', 'missing'],
    ]);
  });

  it('AC-20: returns an empty result, not an error, on any internal failure or unknown repo', async () => {
    const failing = makeService({ getEnabledAgentAttachments: async () => { throw new Error('db down'); } });
    expect(await failing.resolveForRepo('r')).toEqual({ texts: [], specs_detail: [], specs_read: [] });
    const noRepo = makeService({ getRepoRef: async () => null });
    expect(await noRepo.resolveForRepo('r')).toEqual({ texts: [], specs_detail: [], specs_read: [] });
  });
});

describe('putAttachments', () => {
  it('AC-14: rejects duplicate paths without writing', async () => {
    let called = false;
    const svc = makeService({ replaceAttachments: async () => { called = true; } });
    await expect(
      svc.putAttachments('w', 'agent', 'a', { repo_id: 'r', paths: ['specs/a.md', 'specs/a.md'] }),
    ).rejects.toMatchObject({ code: 'invalid_path', statusCode: 400 });
    expect(called).toBe(false);
  });

  it('rejects bad paths before touching the repository', async () => {
    let called = false;
    const svc = makeService({ replaceAttachments: async () => { called = true; } });
    await expect(
      svc.putAttachments('w', 'agent', 'a', { repo_id: 'r', paths: ['specs/a.md', '../x.md'] }),
    ).rejects.toMatchObject({ code: 'invalid_path' });
    expect(called).toBe(false);
  });
});
