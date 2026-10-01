import { describe, it, expect, vi } from 'vitest';
import { BlastService } from '../src/modules/blast/service.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { NotFoundError } from '../src/platform/errors.js';

function makeService(opts: {
  pull?: { repoId: string } | undefined;
  files?: string[];
  blast?: Record<string, unknown>;
  state?: Record<string, unknown>;
  flag?: boolean;
}) {
  const getBlastRadius = vi.fn(async () => ({
    changedSymbols: [{ file: 'a.ts', name: 'alpha', kind: 'function' }],
    callers: [{ file: 'r.ts', symbol: 'run', viaSymbol: 'alpha', line: 4, rank: 1 }],
    impactedEndpoints: [],
    degraded: false,
    ...opts.blast,
  }));
  const getIndexState = vi.fn(async () => ({ status: 'full', ...opts.state }));
  const container = {
    config: { repoIntelEnabled: opts.flag ?? true },
    reviewRepo: {
      getPull: async () => ('pull' in opts ? opts.pull : { repoId: 'repo-1' }),
      getPrFiles: async () => (opts.files ?? ['a.ts']).map((path) => ({ path })),
    },
    repoIntel: { getBlastRadius, getIndexState },
  };
  return { service: new BlastService(container as never), getBlastRadius, getIndexState };
}

describe('BlastService', () => {
  it('calls the facade once with the PR files and maps the result', async () => {
    const { service, getBlastRadius } = makeService({ files: ['a.ts', 'b.ts'] });
    const out = await service.getBlast('ws', 'pr');
    expect(getBlastRadius).toHaveBeenCalledTimes(1);
    expect(getBlastRadius).toHaveBeenCalledWith('repo-1', ['a.ts', 'b.ts']);
    expect(out.downstream[0]!.callers[0]).toEqual({ name: 'run', file: 'r.ts', line: 4 });
    expect(out.degraded).toBeUndefined();
  });

  it('degraded facade result + failed index → index_failed, callers retained', async () => {
    const { service } = makeService({
      blast: { degraded: true, reason: 'no_data' },
      state: { status: 'failed', degradedReason: 'index_failed' },
    });
    const out = await service.getBlast('ws', 'pr');
    expect(out.degraded).toBe(true);
    expect(out.reason).toBe('index_failed');
    expect(out.downstream).toHaveLength(1);
  });

  it('partial index with a healthy result → degraded index_partial', async () => {
    const { service } = makeService({ state: { status: 'partial' } });
    const out = await service.getBlast('ws', 'pr');
    expect(out).toMatchObject({ degraded: true, reason: 'index_partial' });
    expect(out.downstream).toHaveLength(1);
  });

  it('flag off → flag_off', async () => {
    const { service } = makeService({
      flag: false,
      blast: { degraded: true, reason: 'no_data', callers: [] },
    });
    expect((await service.getBlast('ws', 'pr')).reason).toBe('flag_off');
  });

  it('unknown PR → NotFoundError, facade never called', async () => {
    const { service, getBlastRadius } = makeService({ pull: undefined });
    await expect(service.getBlast('ws', 'pr')).rejects.toBeInstanceOf(NotFoundError);
    expect(getBlastRadius).not.toHaveBeenCalled();
  });
});

describe('GET /pulls/:id/blast (no DB)', () => {
  it('non-uuid id → 422', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/blast' });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});
