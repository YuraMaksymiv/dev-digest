import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingService } from './service.js';
import type { OnboardingRepository } from './repository.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'onb-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }));
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lock');
  writeFileSync(join(root, 'src/a.ts'), '// TODO fix\nexport const a = 1;\n');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function make(opts: { status?: 'full' | 'degraded'; completeStructured?: ReturnType<typeof vi.fn> } = {}) {
  const logs: Record<string, unknown>[] = [];
  const upsert = vi.fn(async () => true);
  const repo = {
    getRepoInWorkspace: async () => ({ id: 'r1', owner: 'o', name: 'n', fullName: 'o/n' }),
    getStored: async () => null,
    getPrTouches: async () => new Map(),
    getFileFacts: async () => [],
    upsertTour: upsert,
  } as unknown as OnboardingRepository;
  const complete = opts.completeStructured ?? vi.fn();
  const svc = new OnboardingService({
    repo,
    repoIntel: {
      getIndexState: async () => ({ status: opts.status ?? 'full', filesIndexed: 1, filesSkipped: 0, lastIndexedSha: 'sha1' }) as never,
      getRankedFiles: async () => [{ path: 'src/a.ts', rank: 1 }],
      getCriticalPaths: async () => [['src/a.ts']],
    },
    git: { clonePathFor: () => root },
    tokenizer: { count: (s) => Math.ceil(s.length / 4) },
    llm: async () => ({ completeStructured: complete }) as never,
    log: { info: (o) => logs.push(o), warn() {} },
  });
  const model = async () => ({ provider: 'openrouter' as const, model: 'm' });
  return { svc, logs, complete, upsert, model };
}

describe('OnboardingService', () => {
  it('AC-26, AC-22: makes zero LLM calls on a degraded index and logs one line', async () => {
    const { svc, logs, complete, model } = make({ status: 'degraded' });
    const res = await svc.generate('w', 'r1', model);
    expect(complete).not.toHaveBeenCalled();
    expect(res.banner?.kind).toBe('index_degraded');
    expect(res.source).toBe('skeleton');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ outcome: 'skipped_index_degraded', llm_calls: 0 });
  });

  it('AC-23, NFR-1, AC-17: single-flights concurrent generations into one request and persists once', async () => {
    const complete = vi.fn(async (_req: unknown) => ({
      data: {
        architecture: { summary_md: 'hi', diagram: null },
        critical_paths: [], run_steps: [{ command: 'pnpm install', note: 'n' }],
        reading_path: [{ path: 'src/a.ts', why: 'core' }], first_tasks: [],
      },
      model: 'm', tokensIn: 10, tokensOut: 5, costUsd: 0.01, raw: '', attempts: 1,
    }));
    const { svc, logs, upsert, model } = make({ completeStructured: complete });
    const [a, b] = await Promise.all([svc.generate('w', 'r1', model), svc.generate('w', 'r1', model)]);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0]?.[0]).toMatchObject({ maxRetries: 0, timeoutMs: 60000, maxTokens: 4000 });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(a.source).toBe('llm');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ outcome: 'success', tokens_in: 10, cost_usd: 0.01, llm_calls: 1 });
  });

  it('AC-25: returns the skeleton with invalid_output and persists nothing', async () => {
    const complete = vi.fn(async () => {
      throw new Error('OpenRouter structured output failed schema validation for x');
    });
    const { svc, upsert, model } = make({ completeStructured: complete });
    const res = await svc.generate('w', 'r1', model);
    expect(res.banner?.kind).toBe('invalid_output');
    expect(res.source).toBe('skeleton');
    expect(upsert).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
