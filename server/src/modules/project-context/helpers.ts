import type { ContextDocRoot, SpecDetail } from '@devdigest/shared';
import { DOC_EXTENSION, ROOTS } from './constants.js';

/**
 * Pure domain slice: path validation, root matching, token truncation, the
 * run-time budget walk. No I/O — the tokenizer arrives as a function.
 */

/**
 * Validates a client-supplied repo-relative path. Returns the path when it is
 * safe and qualifies (forward slashes, no `.`/`..`/empty segments, not
 * absolute, ends in `.md`, has a directory segment equal to a root), else null.
 */
export function validateDocPath(path: unknown): string | null {
  if (typeof path !== 'string' || path.length === 0 || path.length > 1024) return null;
  if (path.includes('\0') || path.includes('\\')) return null;
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return null;
  const segments = path.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return null;
  if (!path.toLowerCase().endsWith(DOC_EXTENSION)) return null;
  return rootTypeOf(path) ? path : null;
}

/** First directory segment that names a root; null when none does. */
export function rootTypeOf(path: string): ContextDocRoot | null {
  const dirs = path.split('/').slice(0, -1);
  for (const seg of dirs) {
    if ((ROOTS as readonly string[]).includes(seg)) return seg as ContextDocRoot;
  }
  return null;
}

/**
 * Largest prefix of `text` whose token count is <= cap (binary search on the
 * character length; ~log2(n) `count` calls).
 */
export function truncateHead(
  text: string,
  cap: number,
  count: (s: string) => number,
): { text: string; tokens: number; truncated: boolean } {
  const full = count(text);
  if (full <= cap) return { text, tokens: full, truncated: false };
  let lo = 0;
  let hi = text.length;
  let best = { text: '', tokens: 0 };
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const slice = text.slice(0, mid);
    const tokens = count(slice);
    if (tokens <= cap) {
      best = { text: slice, tokens };
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return { ...best, truncated: true };
}

export function isBinary(text: string): boolean {
  return text.includes('\0');
}

export interface Candidate {
  path: string;
  source: 'agent' | 'skill';
  source_name: string | null;
  /** Outcome of reading the file, before the total budget is applied. */
  status: 'read' | 'truncated' | 'missing' | 'unreadable';
  text: string;
  tokens: number;
}

/** First occurrence of a path wins (agent docs precede skill docs). */
export function dedupCandidates<T extends { path: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.path)) continue;
    seen.add(item.path);
    out.push(item);
  }
  return out;
}

export interface BudgetResult {
  texts: { source: string; text: string }[];
  specs_detail: SpecDetail[];
  specs_read: string[];
}

/**
 * Walks candidates in order, adding each readable doc until the total token
 * budget would be exceeded; later docs that don't fit become `over_budget`
 * (recording their own capped token count) while smaller later ones may still fit.
 */
export function applyBudget(candidates: Candidate[], totalBudget: number): BudgetResult {
  const texts: BudgetResult['texts'] = [];
  const specs_detail: SpecDetail[] = [];
  const specs_read: string[] = [];
  let used = 0;
  for (const c of candidates) {
    const base = { path: c.path, source: c.source, source_name: c.source_name };
    if (c.status === 'missing' || c.status === 'unreadable') {
      specs_detail.push({ ...base, tokens: 0, status: c.status });
      continue;
    }
    if (used + c.tokens > totalBudget) {
      specs_detail.push({ ...base, tokens: c.tokens, status: 'over_budget' });
      continue;
    }
    used += c.tokens;
    texts.push({ source: c.path, text: c.text });
    specs_read.push(c.path);
    specs_detail.push({ ...base, tokens: c.tokens, status: c.status });
  }
  return { texts, specs_detail, specs_read };
}

export function sumTokens(items: { tokens: number }[]): number {
  return items.reduce((n, i) => n + i.tokens, 0);
}
