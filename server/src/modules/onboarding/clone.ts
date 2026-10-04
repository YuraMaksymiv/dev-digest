import { constants as fsConstants } from 'node:fs';
import { lstat, open, realpath, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { isSafeRelPath } from './helpers.js';

export type CloneRead =
  | { kind: 'ok'; text: string; size: number; truncated: boolean }
  | { kind: 'skipped' };

export async function cloneExists(root: string): Promise<boolean> {
  try {
    return (await stat(root)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Reads at most `maxBytes` of one clone file. The clone is NOT a safe root
 * (`.git/config` holds the token-bearing URL; tracked symlinks can point at it),
 * so the path rules are re-run on the realpath-relative path, every segment of the unresolved path must not be a symlink, the file is
 * opened with O_NOFOLLOW and lstat is compared to fstat (server INSIGHTS
 * 2026-10-04, same shape as `project-context` `readDoc`). Anything unsafe,
 * missing or non-text is `skipped`.
 */
export async function readCloneFile(root: string, path: string, maxBytes: number): Promise<CloneRead> {
  if (!isSafeRelPath(path)) return { kind: 'skipped' };
  try {
    const rootReal = await realpath(root);
    const abs = join(rootReal, path);
    let cur = rootReal;
    for (const seg of path.split('/')) {
      cur = join(cur, seg);
      if ((await lstat(cur)).isSymbolicLink()) return { kind: 'skipped' };
    }
    const real = await realpath(abs);
    if (!real.startsWith(rootReal + sep)) return { kind: 'skipped' };
    const realRel = relative(rootReal, real).split(sep).join('/');
    if (!isSafeRelPath(realRel)) return { kind: 'skipped' };
    const pre = await lstat(real);
    if (!pre.isFile()) return { kind: 'skipped' };
    const fh = await open(real, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    try {
      const st = await fh.stat();
      if (!st.isFile() || st.dev !== pre.dev || st.ino !== pre.ino) return { kind: 'skipped' };
      const buf = Buffer.alloc(maxBytes + 1);
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
      const truncated = bytesRead > maxBytes;
      const slice = buf.subarray(0, Math.min(bytesRead, maxBytes));
      if (slice.includes(0)) return { kind: 'skipped' };
      return { kind: 'ok', text: slice.toString('utf8'), size: st.size, truncated };
    } finally {
      await fh.close();
    }
  } catch {
    return { kind: 'skipped' };
  }
}
