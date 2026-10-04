import { describe, it, expect } from 'vitest';
import {
  applyBudget,
  dedupCandidates,
  rootTypeOf,
  truncateHead,
  validateDocPath,
  type Candidate,
} from './helpers.js';

const count = (s: string) => Math.ceil(s.length / 4);

describe('validateDocPath', () => {
  it.each(['specs/a.md', 'docs/x/y.md', 'a/b/insights/c.MD', 'server/docs/readme.md'])('accepts %s', (p) => {
    expect(validateDocPath(p)).toBe(p);
  });
  it.each([
    '../specs/a.md',
    'specs/../../etc/passwd.md',
    '/specs/a.md',
    'C:/specs/a.md',
    'specs\\a.md',
    'specs/a.txt',
    'src/a.md',
    'docs.md',
    'specs//a.md',
    './specs/a.md',
    'specs/a\0.md',
    '',
  ])('rejects %j', (p) => {
    expect(validateDocPath(p)).toBeNull();
  });
  it('rejects non-strings', () => {
    expect(validateDocPath(undefined)).toBeNull();
    expect(validateDocPath(42)).toBeNull();
  });
});

describe('rootTypeOf', () => {
  it('uses the first matching directory segment', () => {
    expect(rootTypeOf('docs/specs/a.md')).toBe('docs');
    expect(rootTypeOf('x/insights/a.md')).toBe('insights');
    expect(rootTypeOf('specs.md')).toBeNull();
  });
});

describe('truncateHead', () => {
  it('returns text untouched under the cap', () => {
    expect(truncateHead('abcd', 10, count)).toEqual({ text: 'abcd', tokens: 1, truncated: false });
  });
  it('AC-20: keeps the largest prefix and appends [truncated] within the cap', () => {
    const r = truncateHead('x'.repeat(100), 5, count);
    expect(r.truncated).toBe(true);
    expect(r.text.endsWith('[truncated]')).toBe(true);
    expect(r.tokens).toBeLessThanOrEqual(5);
  });
});

const cand = (path: string, tokens: number, over: Partial<Candidate> = {}): Candidate => ({
  path,
  source: 'agent',
  source_name: null,
  status: 'read',
  text: path,
  tokens,
  ...over,
});

describe('dedupCandidates', () => {
  it('first occurrence wins', () => {
    const out = dedupCandidates([
      { path: 'a', who: 1 },
      { path: 'b', who: 2 },
      { path: 'a', who: 3 },
    ]);
    expect(out.map((o) => o.who)).toEqual([1, 2]);
  });
});

describe('applyBudget', () => {
  it('marks docs that overflow as over_budget with their own tokens, smaller later ones still fit', () => {
    const r = applyBudget([cand('a', 6), cand('b', 6), cand('c', 3)], 10);
    expect(r.specs_read).toEqual(['a', 'c']);
    expect(r.specs_detail.map((d) => [d.path, d.status, d.tokens])).toEqual([
      ['a', 'read', 6],
      ['b', 'over_budget', 6],
      ['c', 'read', 3],
    ]);
  });
  it('records missing/unreadable with zero tokens and keeps truncated status', () => {
    const r = applyBudget(
      [cand('m', 0, { status: 'missing' }), cand('u', 0, { status: 'unreadable' }), cand('t', 4, { status: 'truncated' })],
      10,
    );
    expect(r.specs_detail.map((d) => d.status)).toEqual(['missing', 'unreadable', 'truncated']);
    expect(r.specs_read).toEqual(['t']);
    expect(r.texts).toEqual([{ source: 't', text: 't' }]);
  });
});
