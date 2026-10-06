import { describe, it, expect, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { NotFoundError } from '../src/platform/errors.js';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import type { Container } from '../src/platform/container.js';

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const REPO = '00000000-0000-0000-0000-000000000001';

const auth = {
  currentUser: async () => ({ id: 'u1' }),
  currentWorkspace: async () => ({ id: 'w1' }),
};

async function appWith(opts: {
  enqueueResync: ReturnType<typeof vi.fn>;
  assertRepoInWorkspace?: () => Promise<void>;
}) {
  const app = await buildApp({
    config,
    overrides: {
      auth: auth as never,
      repoIntel: { enqueueResync: opts.enqueueResync } as unknown as RepoIntel,
    },
  });
  Object.defineProperty(app.container, 'projectContextService', {
    value: { assertRepoInWorkspace: opts.assertRepoInWorkspace ?? (async () => undefined) },
  });
  return app;
}

describe('POST /repos/:repoId/context/reindex', () => {
  it('AC-44: answers 202 { status: accepted, jobId } for a repo in the workspace', async () => {
    const enqueueResync = vi.fn(async () => ({ jobId: 'job-1' }));
    const app = await appWith({ enqueueResync });
    const res = await app.inject({ method: 'POST', url: `/repos/${REPO}/context/reindex` });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ status: 'accepted', jobId: 'job-1' });
    expect(enqueueResync).toHaveBeenCalledWith('w1', REPO);
    await app.close();
  });

  it('AC-46: a repo outside the workspace answers 404 and enqueues nothing', async () => {
    const enqueueResync = vi.fn(async () => ({ jobId: 'x' }));
    const app = await appWith({
      enqueueResync,
      assertRepoInWorkspace: async () => {
        throw new NotFoundError('Repository not found');
      },
    });
    const res = await app.inject({ method: 'POST', url: `/repos/${REPO}/context/reindex` });
    expect(res.statusCode).toBe(404);
    expect(enqueueResync).not.toHaveBeenCalled();
    await app.close();
  });

  it('AC-47: a degraded enqueue still answers 202 with degraded + reason', async () => {
    const enqueueResync = vi.fn(async () => ({ degraded: true as const, reason: 'no_handler' }));
    const app = await appWith({ enqueueResync });
    const res = await app.inject({ method: 'POST', url: `/repos/${REPO}/context/reindex` });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ status: 'accepted', degraded: true, reason: 'no_handler' });
    await app.close();
  });

  it('rejects a malformed repo id before any work', async () => {
    const enqueueResync = vi.fn();
    const app = await appWith({ enqueueResync });
    const res = await app.inject({ method: 'POST', url: '/repos/nope/context/reindex' });
    expect(res.statusCode).toBe(422);
    expect(enqueueResync).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('RepoIntelService.enqueueResync', () => {
  function make(enqueue: ReturnType<typeof vi.fn>) {
    return new RepoIntelService({ db: {}, jobs: { enqueue } } as unknown as Container);
  }

  it('NFR-8: resolves with the job id without waiting for the job body', async () => {
    const enqueue = vi.fn(async () => ({ id: 'job-1', done: new Promise<void>(() => {}) }));
    const res = await make(enqueue).enqueueResync('w1', 'r1');
    expect(res).toEqual({ jobId: 'job-1' });
  });

  it('AC-45: a second call while the job runs returns the same job and enqueues once', async () => {
    const enqueue = vi.fn(async () => ({ id: 'job-1', done: new Promise<void>(() => {}) }));
    const svc = make(enqueue);
    const [a, b] = await Promise.all([svc.enqueueResync('w1', 'r1'), svc.enqueueResync('w1', 'r1')]);
    expect(a).toEqual(b);
    expect(enqueue).toHaveBeenCalledTimes(1);
    await svc.enqueueResync('w2', 'r1');
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it('allows a new job once the previous one settled, even if it failed', async () => {
    let fail!: (e: Error) => void;
    const enqueue = vi
      .fn()
      .mockImplementationOnce(async () => ({
        id: 'job-1',
        done: new Promise<void>((_, rej) => {
          fail = rej;
        }),
      }))
      .mockImplementationOnce(async () => ({ id: 'job-2', done: new Promise<void>(() => {}) }));
    const svc = make(enqueue);
    await svc.enqueueResync('w1', 'r1');
    fail(new Error('boom'));
    await new Promise((r) => setTimeout(r, 0));
    expect(await svc.enqueueResync('w1', 'r1')).toEqual({ jobId: 'job-2' });
  });

  it('AC-47: an enqueue throw degrades instead of throwing and is not cached', async () => {
    const enqueue = vi
      .fn()
      .mockRejectedValueOnce(new Error('no handler'))
      .mockResolvedValueOnce({ id: 'job-3', done: new Promise<void>(() => {}) });
    const svc = make(enqueue);
    expect(await svc.enqueueResync('w1', 'r1')).toEqual({ degraded: true, reason: 'no_handler' });
    expect(await svc.enqueueResync('w1', 'r1')).toEqual({ jobId: 'job-3' });
  });
});
