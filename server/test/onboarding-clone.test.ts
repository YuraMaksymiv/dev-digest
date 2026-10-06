import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readCloneFile } from '../src/modules/onboarding/clone.js';

let root: string;
let outside: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'onb-clone-'));
  outside = mkdtempSync(join(tmpdir(), 'onb-outside-'));
  mkdirSync(join(root, '.git'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, '.git/config'), '[remote "origin"]\n url = https://x-access-token:ghp_SECRET@github.com/o/r.git\n');
  writeFileSync(join(root, 'src/a.ts'), 'export const a = 1;\n');
  writeFileSync(join(outside, 'secret.txt'), 'outside-secret');
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('onboarding safe clone reads', () => {
  it('AC-11: reads a regular file inside the clone', async () => {
    const r = await readCloneFile(root, 'src/a.ts', 1000);
    expect(r).toMatchObject({ kind: 'ok', text: 'export const a = 1;\n' });
  });

  it('AC-11, NFR-6: skips any path with a .git segment (token in .git/config is unreachable)', async () => {
    expect(await readCloneFile(root, '.git/config', 1000)).toEqual({ kind: 'skipped' });
    expect(await readCloneFile(root, 'sub/.GIT/config', 1000)).toEqual({ kind: 'skipped' });
  });

  it('AC-11: skips traversal and absolute paths', async () => {
    expect(await readCloneFile(root, '../' + outside.split('/').pop() + '/secret.txt', 1000)).toEqual({ kind: 'skipped' });
    expect(await readCloneFile(root, join(outside, 'secret.txt'), 1000)).toEqual({ kind: 'skipped' });
  });

  it('AC-11: skips a symlink that resolves outside the clone', async () => {
    symlinkSync(join(outside, 'secret.txt'), join(root, 'src/leak.ts'));
    expect(await readCloneFile(root, 'src/leak.ts', 1000)).toEqual({ kind: 'skipped' });
  });

  it('AC-11, NFR-6: skips a symlink that points at .git/config', async () => {
    symlinkSync(join(root, '.git/config'), join(root, 'README.md'));
    expect(await readCloneFile(root, 'README.md', 1000)).toEqual({ kind: 'skipped' });
  });

  it('AC-11: skips any symlink, even one that resolves to another file inside the clone', async () => {
    symlinkSync(join(root, 'src/a.ts'), join(root, 'src/alias.ts'));
    expect(await readCloneFile(root, 'src/alias.ts', 1000)).toEqual({ kind: 'skipped' });
  });

  it('AC-11: skips a file reached through a symlinked directory', async () => {
    symlinkSync(outside, join(root, 'linked'));
    expect(await readCloneFile(root, 'linked/secret.txt', 1000)).toEqual({ kind: 'skipped' });
  });
});
