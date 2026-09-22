/**
 * PR-list rollup helpers (`modules/pulls/status.ts`) — the pure derivation that
 * decides each PR's review STATUS and tallies its FINDINGS for the list. The DB
 * `status` column holds GitHub's merge state; the review status
 * (needs_review / reviewed / stale) is derived here from head vs lastReviewedSha
 * + age, so it gets unit coverage independent of the route's queries.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveReviewStatus,
  rollupSeverities,
  toFindingPreviews,
  toSeverityBreakdown,
  PREVIEW_LIMIT,
  STALE_DAYS,
} from '../src/modules/pulls/status.js';

const DAY = 86_400_000;
const now = Date.UTC(2026, 5, 11);

describe('deriveReviewStatus', () => {
  it('needs_review when never reviewed, or when head moved since the last review', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: null, headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'old', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
  });

  it('reviewed when the current head was reviewed and the PR is recent', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now - DAY), now }),
    ).toBe('reviewed');
  });

  it('stale when the current head was reviewed but the PR is older than STALE_DAYS', () => {
    expect(
      deriveReviewStatus({
        ghStatus: 'open',
        lastReviewedSha: 'abc',
        headSha: 'abc',
        updatedAt: new Date(now - (STALE_DAYS + 1) * DAY),
        now,
      }),
    ).toBe('stale');
  });

  it('keeps merged/closed regardless of review state', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'merged', lastReviewedSha: null, headSha: 'abc', updatedAt: null, now }),
    ).toBe('merged');
    expect(
      deriveReviewStatus({ ghStatus: 'closed', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('closed');
  });
});

describe('rollupSeverities', () => {
  it('tallies findings into critical / warning / suggestion buckets (ignores unknown)', () => {
    expect(
      rollupSeverities([
        { severity: 'CRITICAL' },
        { severity: 'CRITICAL' },
        { severity: 'WARNING' },
        { severity: 'SUGGESTION' },
        { severity: 'WEIRD' },
      ]),
    ).toEqual({ critical: 2, warning: 1, suggestion: 1 });
  });

  it('is all-zero for no findings', () => {
    expect(rollupSeverities([])).toEqual({ critical: 0, warning: 0, suggestion: 0 });
  });
});

describe('toSeverityBreakdown', () => {
  it('maps the tally onto the wire\'s severity-enum keys', () => {
    expect(toSeverityBreakdown({ critical: 2, warning: 1, suggestion: 0 })).toEqual({
      CRITICAL: 2,
      WARNING: 1,
      SUGGESTION: 0,
    });
  });

  it('reads all-zero for a review with no findings (distinct from an unreviewed PR)', () => {
    expect(toSeverityBreakdown(undefined)).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });
});

describe('toFindingPreviews', () => {
  const row = (over: Partial<Parameters<typeof toFindingPreviews>[0][number]>) => ({
    severity: 'WARNING',
    category: 'bug',
    title: 't',
    file: 'src/a.ts',
    startLine: 3,
    confidence: 0.5,
    rationale: 'r',
    ...over,
  });

  it('orders worst severity first, then most confident, and maps to the wire shape', () => {
    const out = toFindingPreviews([
      row({ title: 'warn-low', confidence: 0.4 }),
      row({ title: 'crit', severity: 'CRITICAL', startLine: 11 }),
      row({ title: 'warn-high', confidence: 0.9 }),
      row({ title: 'sugg', severity: 'SUGGESTION' }),
    ]);
    expect(out.map((f) => f.title)).toEqual(['crit', 'warn-high', 'warn-low', 'sugg']);
    expect(out[0]).toEqual({
      severity: 'CRITICAL',
      category: 'bug',
      title: 'crit',
      file: 'src/a.ts',
      start_line: 11,
      confidence: 0.5,
      rationale: 'r',
    });
  });

  it('caps the preview at PREVIEW_LIMIT — the popover shows the rest as a count', () => {
    const many = Array.from({ length: PREVIEW_LIMIT + 3 }, (_, i) => row({ title: `f${i}` }));
    expect(toFindingPreviews(many)).toHaveLength(PREVIEW_LIMIT);
  });

  it('is empty for a review with no findings', () => {
    expect(toFindingPreviews([])).toEqual([]);
  });
});
