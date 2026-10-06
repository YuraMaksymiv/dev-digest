import type { ContextAttachment, ContextDoc, ContextDocRoot } from "@devdigest/shared";
import { ROOT_NAMES } from "./constants";

/** Pure row model for the attach-docs picker. */

export interface DocRowState {
  path: string;
  name: string;
  folder: string;
  rootType: ContextDocRoot | null;
  attached: boolean;
  /** Attached but gone from the clone — skipped at run time. */
  missing: boolean;
  tokens: number;
}

export function splitPath(path: string): { name: string; folder: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { name: path, folder: "" } : { name: path.slice(i + 1), folder: path.slice(0, i + 1) };
}

function rootOf(path: string): ContextDocRoot | null {
  const segments = path.split("/").slice(0, -1);
  const first = segments.find((seg) => (ROOT_NAMES as readonly string[]).includes(seg));
  return (first as ContextDocRoot | undefined) ?? null;
}

/**
 * Attached docs first, in their saved order, then every other doc of the repo
 * alphabetically. An attached path the listing no longer returns stays as a row
 * flagged `missing` so it can still be unchecked.
 */
export function buildRows(docs: ContextDoc[], attachments: ContextAttachment[]): DocRowState[] {
  const byPath = new Map(docs.map((d) => [d.path, d]));
  const seen = new Set<string>();
  const rows: DocRowState[] = [];

  for (const a of [...attachments].sort((x, y) => x.position - y.position)) {
    if (seen.has(a.path)) continue;
    seen.add(a.path);
    const doc = byPath.get(a.path);
    rows.push({
      path: a.path,
      ...splitPath(a.path),
      rootType: doc?.root_type ?? rootOf(a.path),
      attached: true,
      missing: a.status === "missing",
      tokens: doc?.tokens ?? a.tokens,
    });
  }

  const rest = docs
    .filter((d) => !seen.has(d.path))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(
      (d): DocRowState => ({
        path: d.path,
        ...splitPath(d.path),
        rootType: d.root_type,
        attached: false,
        missing: false,
        tokens: d.tokens,
      }),
    );

  return [...rows, ...rest];
}

/** Move the row at `from` to index `to`, clamped. Returns a new array. */
export function moveRow(rows: DocRowState[], from: number, to: number): DocRowState[] {
  if (from === to || from < 0 || from >= rows.length) return rows;
  const target = Math.max(0, Math.min(rows.length - 1, to));
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  if (!moved) return rows;
  next.splice(target, 0, moved);
  return next;
}

export function toggleRow(rows: DocRowState[], path: string, attached: boolean): DocRowState[] {
  return rows.map((r) => (r.path === path ? { ...r, attached } : r));
}

/** The whole ordered attached set — order is a property of the set. */
export function toPaths(rows: DocRowState[]): string[] {
  return rows.filter((r) => r.attached).map((r) => r.path);
}

export function countAttached(rows: DocRowState[]): number {
  return rows.filter((r) => r.attached).length;
}

/** Tokens the attached docs would add; a missing file adds nothing. */
export function attachedTokens(rows: DocRowState[]): number {
  return rows.reduce((sum, r) => (r.attached && !r.missing ? sum + r.tokens : sum), 0);
}

export function filterRows(rows: DocRowState[], query: string): DocRowState[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.path.toLowerCase().includes(q));
}

export interface SerializedEntry {
  path: string;
  tokens: number;
  /** 1-based position in the order the docs reach the prompt (across groups). */
  order: number;
}

export interface SerializedGroup {
  group: ContextDocRoot;
  tokens: number;
  entries: SerializedEntry[];
}

/**
 * The attached docs in the order the server serializes them: grouped
 * specs, docs, insights, the picker order kept inside a group. Missing docs are
 * excluded, empty groups are not returned.
 */
export function groupSerialized(rows: DocRowState[]): SerializedGroup[] {
  const live = rows.filter((r) => r.attached && !r.missing);
  let order = 0;
  const out: SerializedGroup[] = [];
  for (const group of ROOT_NAMES) {
    const inGroup = live.filter((r) => (r.rootType ?? "docs") === group);
    if (inGroup.length === 0) continue;
    out.push({
      group,
      tokens: inGroup.reduce((sum, r) => sum + r.tokens, 0),
      entries: inGroup.map((r) => ({ path: r.path, tokens: r.tokens, order: ++order })),
    });
  }
  return out;
}
