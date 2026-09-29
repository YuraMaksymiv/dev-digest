import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { classifyFile, buildSmartDiff, type SmartDiffInputFile } from '../src/modules/reviews/helpers.js';
import { SMART_DIFF_GROUP_ORDER } from '../src/modules/reviews/constants.js';
import type { FindingRow } from '../src/db/rows.js';

/**
 * `classifyFile` — path → role, one row per role plus the 3 disambiguation
 * cases the rule ordering exists to resolve (see constants.ts's comment).
 */
describe('classifyFile', () => {
  it('classifies a plain source file as core (the fallback, not a rule)', () => {
    expect(classifyFile('src/app.ts')).toBe('core');
  });

  it('classifies test files as tests', () => {
    expect(classifyFile('src/foo.test.ts')).toBe('tests');
  });

  it('classifies index/config/wiring files as wiring', () => {
    expect(classifyFile('src/index.ts')).toBe('wiring');
  });

  it('classifies markdown/docs files as docs', () => {
    expect(classifyFile('docs/architecture.md')).toBe('docs');
  });

  it('classifies lock files as boilerplate', () => {
    expect(classifyFile('pnpm-lock.yaml')).toBe('boilerplate');
  });

  it('disambiguation: a .snap file under __tests__/ is still boilerplate (snapshot rule wins)', () => {
    expect(classifyFile('__tests__/x.snap')).toBe('boilerplate');
  });

  it('any file under a __snapshots__/ dir is boilerplate, even without a .snap extension', () => {
    expect(classifyFile('src/__tests__/__snapshots__/data.json')).toBe('boilerplate');
  });

  it('disambiguation: a markdown file under .claude/ is wiring, not docs', () => {
    expect(classifyFile('.claude/skills/foo.md')).toBe('wiring');
  });

  it('disambiguation: a README under e2e/ is tests, not docs', () => {
    expect(classifyFile('e2e/README.md')).toBe('tests');
  });
});

describe('buildSmartDiff', () => {
  const finding = (over: Partial<FindingRow>): FindingRow =>
    ({
      id: 'f1',
      reviewId: 'r1',
      file: 'src/a.ts',
      startLine: 1,
      endLine: 1,
      severity: 'CRITICAL',
      category: 'security',
      title: 't',
      rationale: 'r',
      suggestion: null,
      confidence: 0.9,
      kind: 'finding',
      trifectaComponents: null,
      acceptedAt: null,
      dismissedAt: null,
      ...over,
    }) as FindingRow;

  it('always returns all 5 groups, in display order, even when empty', () => {
    const diff = buildSmartDiff([], []);
    expect(diff.groups.map((g) => g.role)).toEqual([...SMART_DIFF_GROUP_ORDER]);
    expect(diff.groups.every((g) => g.files.length === 0)).toBe(true);
  });

  it('buckets files by role and sorts/dedupes each file\'s finding lines', () => {
    const files: SmartDiffInputFile[] = [
      { path: 'src/a.ts', additions: 10, deletions: 2 },
      { path: 'src/a.test.ts', additions: 5, deletions: 0 },
      { path: 'src/index.ts', additions: 1, deletions: 0 },
      { path: 'README.md', additions: 3, deletions: 0 },
      { path: 'pnpm-lock.yaml', additions: 100, deletions: 0 },
    ];
    const findings = [
      finding({ file: 'src/a.ts', startLine: 20 }),
      finding({ file: 'src/a.ts', startLine: 5 }),
      finding({ file: 'src/a.ts', startLine: 20 }), // duplicate line, same file
    ];
    const diff = buildSmartDiff(files, findings);

    const byRole = new Map(diff.groups.map((g) => [g.role, g.files]));
    expect(byRole.get('core')!.map((f) => f.path)).toEqual(['src/a.ts']);
    expect(byRole.get('core')![0]!.finding_lines).toEqual([5, 20]);
    expect(byRole.get('tests')!.map((f) => f.path)).toEqual(['src/a.test.ts']);
    expect(byRole.get('wiring')!.map((f) => f.path)).toEqual(['src/index.ts']);
    expect(byRole.get('docs')!.map((f) => f.path)).toEqual(['README.md']);
    expect(byRole.get('boilerplate')!.map((f) => f.path)).toEqual(['pnpm-lock.yaml']);
  });

  it('a zero-findings, zero-files input still parses via the real SmartDiff contract', () => {
    const diff = buildSmartDiff([], []);
    expect(SmartDiff.safeParse(diff).success).toBe(true);
    expect(diff.split_suggestion).toEqual({ too_big: false, total_lines: 0, proposed_splits: [] });
  });
});
