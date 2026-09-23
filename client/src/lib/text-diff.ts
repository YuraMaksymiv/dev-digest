/**
 * Line diff between two bodies, for the skill version history.
 *
 * A dependency-free LCS: skill bodies are prompt-sized (hundreds of lines at
 * most), so the O(n·m) table costs nothing here and saves pulling a diff
 * library into the bundle for one screen.
 */

export type DiffKind = "add" | "del" | "ctx";

export interface DiffLine {
  kind: DiffKind;
  text: string;
  /** 1-based line number in the OLD body (absent for an addition). */
  oldLine?: number;
  /** 1-based line number in the NEW body (absent for a deletion). */
  newLine?: number;
}

/** A run of unchanged lines the view collapses to one "N unchanged" row. */
export interface DiffGap {
  kind: "gap";
  count: number;
}

export type DiffRow = DiffLine | DiffGap;

/** Longest-common-subsequence table over two line arrays. */
function lcsLengths(a: string[], b: string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i]![j] =
        a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  return table;
}

/** Full line-by-line diff, oldest content first. */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const table = lcsLengths(a, b);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "ctx", text: a[i]!, oldLine: i + 1, newLine: j + 1 });
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      out.push({ kind: "del", text: a[i]!, oldLine: i + 1 });
      i++;
    } else {
      out.push({ kind: "add", text: b[j]!, newLine: j + 1 });
      j++;
    }
  }
  while (i < a.length) out.push({ kind: "del", text: a[i]!, oldLine: ++i });
  while (j < b.length) out.push({ kind: "add", text: b[j]!, newLine: ++j });
  return out;
}

/**
 * Collapse long unchanged stretches, keeping `context` lines either side of
 * every change — a 200-line body with a one-word edit should not render 199
 * identical rows for the reader to scroll past.
 */
export function collapseUnchanged(lines: DiffLine[], context = 2): DiffRow[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, idx) => {
    if (l.kind === "ctx") return;
    for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k++) {
      keep[k] = true;
    }
  });

  const out: DiffRow[] = [];
  let run = 0;
  for (let idx = 0; idx < lines.length; idx++) {
    if (keep[idx]) {
      if (run > 0) {
        out.push({ kind: "gap", count: run });
        run = 0;
      }
      out.push(lines[idx]!);
    } else {
      run++;
    }
  }
  if (run > 0) out.push({ kind: "gap", count: run });
  return out;
}

export interface DiffStat {
  added: number;
  removed: number;
}

export function diffStat(lines: DiffLine[]): DiffStat {
  return {
    added: lines.filter((l) => l.kind === "add").length,
    removed: lines.filter((l) => l.kind === "del").length,
  };
}
