import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';

/**
 * Unit coverage for `DiffHunk.header` (A1/A2): the raw trimmed hunk-header
 * line, threaded through so the intent classifier can see WHERE inside a
 * file a change landed, not just which file changed.
 */
describe('parseUnifiedDiff — hunk header capture', () => {
  it('a hunk with trailing context captures the full trimmed line', () => {
    const raw = [
      'diff --git a/src/config.ts b/src/config.ts',
      '--- a/src/config.ts',
      '+++ b/src/config.ts',
      '@@ -10,3 +10,4 @@ export function loadConfig() {',
      '   port: 3000,',
      '+  stripeKey: "sk_live_xxx",',
      '   redisUrl: x,',
    ].join('\n');
    const diff = parseUnifiedDiff(raw);
    expect(diff.files).toHaveLength(1);
    expect(diff.files[0]!.hunks).toHaveLength(1);
    expect(diff.files[0]!.hunks[0]!.header).toBe(
      '@@ -10,3 +10,4 @@ export function loadConfig() {',
    );
  });

  it('a hunk with no trailing context still gets a defined .header', () => {
    const raw = [
      'diff --git a/README.md b/README.md',
      '--- a/README.md',
      '+++ b/README.md',
      '@@ -1,1 +1,2 @@',
      ' line',
      '+doc line',
    ].join('\n');
    const diff = parseUnifiedDiff(raw);
    expect(diff.files[0]!.hunks[0]!.header).toBe('@@ -1,1 +1,2 @@');
  });

  it('multiple hunks in one file each keep their own header', () => {
    const raw = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,2 +1,2 @@ function one() {',
      ' a',
      '-b',
      '+bb',
      '@@ -10,2 +10,2 @@ function two() {',
      ' c',
      '-d',
      '+dd',
    ].join('\n');
    const diff = parseUnifiedDiff(raw);
    expect(diff.files[0]!.hunks).toHaveLength(2);
    expect(diff.files[0]!.hunks[0]!.header).toBe('@@ -1,2 +1,2 @@ function one() {');
    expect(diff.files[0]!.hunks[1]!.header).toBe('@@ -10,2 +10,2 @@ function two() {');
  });
});
