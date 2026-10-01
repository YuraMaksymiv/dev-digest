import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_OUTPUT_CHARS } from '../domain/constants.js';
import type { Finding, Severity } from '../domain/types.js';
import { ApiError } from '../ports.js';
import { FakeApi, RUN_ID, review, runDetail } from '../test-support/fake-api.js';
import { FindingsService } from './findings.service.js';

function finding(i: number, severity: Severity = 'WARNING', over: Partial<Finding> = {}): Finding {
  return {
    id: `f${String(i).padStart(3, '0')}`,
    severity,
    category: 'bug',
    title: `Title ${i}`,
    file: 'src/a.ts',
    startLine: i,
    endLine: i,
    rationale: `Why ${i}`,
    suggestion: `Fix ${i}`,
    ...over,
  };
}

const base = { runId: RUN_ID, format: 'concise' as const, limit: 10 };

describe('FindingsService', () => {
  let api: FakeApi;
  let service: FindingsService;
  beforeEach(() => {
    api = new FakeApi();
    service = new FindingsService(api);
  });

  it('says status=running while the run is in progress', async () => {
    api.run = runDetail({ status: 'running' });
    const out = await service.getFindings(base);
    expect(out.isError).toBe(false);
    expect(out.text).toContain('status=running');
    expect(out.text).toContain('get_findings');
    expect(api.calls.some((c) => c.startsWith('listReviews'))).toBe(false);
  });

  it('reports failed runs as errors with the reason', async () => {
    api.run = runDetail({ status: 'failed', error: 'boom' });
    const out = await service.getFindings(base);
    expect(out.isError).toBe(true);
    expect(out.text).toContain('boom');
  });

  it('reports cancelled runs as errors', async () => {
    api.run = runDetail({ status: 'cancelled' });
    expect((await service.getFindings(base)).isError).toBe(true);
  });

  it('only reads findings of the requested run and review kind', async () => {
    api.reviews = [
      review([finding(1)], { runId: 'other-run' }),
      review([finding(2)], { kind: 'summary' }),
      review([finding(3)]),
    ];
    const out = await service.getFindings(base);
    expect(out.text).toContain('Title 3');
    expect(out.text).not.toContain('Title 1');
    expect(out.text).not.toContain('Title 2');
  });

  it('sorts by severity, then file and line', async () => {
    api.reviews = [
      review([
        finding(1, 'SUGGESTION'),
        finding(2, 'CRITICAL', { file: 'src/z.ts' }),
        finding(3, 'CRITICAL', { file: 'src/b.ts' }),
        finding(4, 'WARNING'),
      ]),
    ];
    const lines = (await service.getFindings(base)).text.split('\n').filter((l) => l.startsWith('['));
    expect(lines.map((l) => l.split(' ')[0])).toEqual(['[CRITICAL]', '[CRITICAL]', '[WARNING]', '[SUGGESTION]']);
    expect(lines[0]).toContain('src/b.ts');
  });

  it('filters by severity', async () => {
    api.reviews = [review([finding(1, 'CRITICAL'), finding(2, 'WARNING')])];
    const out = await service.getFindings({ ...base, severity: 'CRITICAL' });
    expect(out.text).toContain('filtered to CRITICAL: 1');
    expect(out.text).not.toContain('Title 2');
  });

  it('adds rationale and fix only in detailed format', async () => {
    api.reviews = [review([finding(1)])];
    expect((await service.getFindings(base)).text).not.toContain('why:');
    const detailed = (await service.getFindings({ ...base, format: 'detailed' })).text;
    expect(detailed).toContain('why: Why 1');
    expect(detailed).toContain('fix: Fix 1');
  });

  it('paginates with a cursor and ends cleanly', async () => {
    api.reviews = [review(Array.from({ length: 25 }, (_, i) => finding(i + 1)))];

    const p1 = (await service.getFindings({ ...base, limit: 10 })).text;
    expect(p1).toContain('Showing 1-10 of 25');
    const c1 = /cursor="([^"]+)"/.exec(p1)![1]!;

    const p2 = (await service.getFindings({ ...base, limit: 10, cursor: c1 })).text;
    expect(p2).toContain('Showing 11-20 of 25');
    expect(p2).toContain('Title 11');
    const c2 = /cursor="([^"]+)"/.exec(p2)![1]!;

    const p3 = (await service.getFindings({ ...base, limit: 10, cursor: c2 })).text;
    expect(p3).toContain('Showing 21-25 of 25');
    expect(p3).toContain('End of results');
    expect(p3).not.toContain('cursor=');
  });

  it('cuts a page at the output budget and resumes without skipping findings', async () => {
    const long = 'x'.repeat(600);
    api.reviews = [review(Array.from({ length: 20 }, (_, i) => finding(i + 1, 'WARNING', { rationale: long })))];

    const p1 = (await service.getFindings({ ...base, limit: 20, format: 'detailed' })).text;
    expect(p1.length).toBeLessThanOrEqual(MAX_OUTPUT_CHARS);
    const shown = Number(/Showing 1-(\d+) of 20/.exec(p1)![1]);
    expect(shown).toBeLessThan(20);

    const cursor = /cursor="([^"]+)"/.exec(p1)![1]!;
    const p2 = (await service.getFindings({ ...base, limit: 20, format: 'detailed', cursor })).text;
    expect(p2).toContain(`Showing ${shown + 1}-`);
    expect(p2).toContain(`Title ${shown + 1}\n`);
  });

  it('rejects a cursor from another run/filter or garbage', async () => {
    api.reviews = [review(Array.from({ length: 15 }, (_, i) => finding(i + 1)))];
    const p1 = (await service.getFindings({ ...base, limit: 5 })).text;
    const cursor = /cursor="([^"]+)"/.exec(p1)![1]!;

    await expect(service.getFindings({ ...base, severity: 'CRITICAL', cursor })).rejects.toThrow('Invalid cursor');
    await expect(service.getFindings({ ...base, cursor: 'not-a-cursor' })).rejects.toThrow('Invalid cursor');
  });

  it('handles a done run with no findings', async () => {
    api.reviews = [review([])];
    expect((await service.getFindings(base)).text).toContain('No findings to show');
  });

  it('turns an unknown run into a next-step error', async () => {
    api.runError = new ApiError('not_found', 'Not found: Run not found');
    await expect(service.getFindings(base)).rejects.toThrow('Use the run_id returned by run_agent_on_pr');
  });

  it('rejects a non-uuid run_id before calling the API', async () => {
    await expect(service.getFindings({ ...base, runId: 'abc' })).rejects.toThrow('Invalid run_id');
    expect(api.calls).toEqual([]);
  });
});
