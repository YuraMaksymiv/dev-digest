import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_OUTPUT_CHARS } from '../domain/constants.js';
import type { Finding, Severity } from '../domain/types.js';
import { ApiError } from '../ports.js';
import { FakeApi, PR_ID, RUN_ID, review, runDetail } from '../test-support/fake-api.js';
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

describe('FindingsService — whole PR (repo + pr_number)', () => {
  let api: FakeApi;
  let service: FindingsService;
  const prBase = { repo: 'acme/widgets', prNumber: 7, format: 'concise' as const, limit: 10 };
  const parse = (text: string) => JSON.parse(/\n(\{.*\})\n/s.exec(text)![1]!);

  beforeEach(() => {
    api = new FakeApi();
    service = new FindingsService(api);
  });

  it('returns every agent review with nested findings and total_findings in one call', async () => {
    api.reviews = [
      review([finding(1, 'WARNING'), finding(2, 'CRITICAL')], { runId: 'run-g', agentName: 'General Reviewer' }),
      review([finding(3, 'SUGGESTION')], { runId: 'run-s', agentName: 'Security Reviewer' }),
    ];
    const out = await service.getFindings(prBase);

    expect(out.isError).toBe(false);
    expect(out.text).toContain('acme/widgets#7: 2 review(s), total_findings=3.');
    expect(out.text).toContain('<untrusted_review_output>');
    const body = parse(out.text);
    expect(body.total_findings).toBe(3);
    expect(body.reviews.map((r: { agent: string }) => r.agent)).toEqual(['General Reviewer', 'Security Reviewer']);
    expect(body.reviews[0]).toMatchObject({ run_id: 'run-g', findings_count: 2 });
    expect(body.reviews[0].findings[0]).toEqual({ severity: 'CRITICAL', location: 'src/a.ts:2', title: 'Title 2' });
    expect(api.calls).toEqual(['lookupPull acme/widgets#7', `listReviews ${PR_ID}`]);
  });

  it('keeps only the latest review per agent and skips non-review rows', async () => {
    api.reviews = [
      review([finding(1)], { runId: 'old', createdAt: '2026-10-01T10:00:00Z' }),
      review([finding(2), finding(3)], { runId: 'new', createdAt: '2026-10-02T10:00:00Z' }),
      review([finding(4)], { runId: 'sum', kind: 'summary', agentName: 'Summarizer' }),
    ];
    const body = parse((await service.getFindings(prBase)).text);
    expect(body.reviews).toHaveLength(1);
    expect(body.reviews[0].run_id).toBe('new');
    expect(body.total_findings).toBe(2);
  });

  it('applies the severity filter and detailed format', async () => {
    api.reviews = [review([finding(1, 'WARNING'), finding(2, 'CRITICAL')])];
    const out = await service.getFindings({ ...prBase, severity: 'CRITICAL', format: 'detailed' });
    expect(out.text).toContain('total_findings=1 (filtered to CRITICAL)');
    expect(parse(out.text).reviews[0].findings[0]).toMatchObject({ rationale: 'Why 2', suggestion: 'Fix 2' });
  });

  it('shrinks the per-review cap to fit the budget and points to run_id paging', async () => {
    const long = 'x'.repeat(150);
    api.reviews = [
      review(Array.from({ length: 30 }, (_, i) => finding(i + 1, 'WARNING', { title: long })), { agentName: 'A', runId: 'ra' }),
      review(Array.from({ length: 30 }, (_, i) => finding(i + 1, 'WARNING', { title: long })), { agentName: 'B', runId: 'rb' }),
    ];
    const out = await service.getFindings({ ...prBase, limit: 50 });
    expect(out.text.length).toBeLessThanOrEqual(MAX_OUTPUT_CHARS);
    const body = parse(out.text);
    expect(body.reviews).toHaveLength(2);
    expect(body.reviews[0].findings_count).toBe(30);
    expect(body.reviews[0].findings.length).toBeLessThan(30);
    expect(out.text).toContain('get_findings(run_id=');
  });

  it('says how to start a review when the PR has none', async () => {
    const out = await service.getFindings(prBase);
    expect(out.text).toContain('no reviews yet');
    expect(out.text).toContain('run_agent_on_pr(repo="acme/widgets", pr_number=7)');
  });

  it('rejects ambiguous or incomplete arguments before calling the API', async () => {
    await expect(service.getFindings({ ...prBase, runId: RUN_ID })).rejects.toThrow('not both');
    await expect(service.getFindings({ repo: 'acme/widgets', format: 'concise', limit: 10 })).rejects.toThrow(
      'repo + pr_number',
    );
    await expect(service.getFindings({ ...prBase, cursor: 'c' })).rejects.toThrow('cursor only works with run_id');
    expect(api.calls).toEqual([]);
  });
});
