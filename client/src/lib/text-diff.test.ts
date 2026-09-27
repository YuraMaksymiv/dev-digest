import { describe, it, expect } from "vitest";
import { collapseUnchanged, diffLines, diffStat, type DiffLine } from "./text-diff";

const kinds = (ls: DiffLine[]) => ls.map((l) => `${l.kind}:${l.text}`);

describe("diffLines", () => {
  it("reports nothing changed for identical text", () => {
    const d = diffLines("a\nb", "a\nb");
    expect(d.every((l) => l.kind === "ctx")).toBe(true);
    expect(diffStat(d)).toEqual({ added: 0, removed: 0 });
  });

  it("marks an inserted line without touching its neighbours", () => {
    expect(kinds(diffLines("a\nc", "a\nb\nc"))).toEqual(["ctx:a", "add:b", "ctx:c"]);
  });

  it("marks a removed line", () => {
    expect(kinds(diffLines("a\nb\nc", "a\nc"))).toEqual(["ctx:a", "del:b", "ctx:c"]);
  });

  it("renders a replacement as a delete plus an add", () => {
    expect(kinds(diffLines("a\nb\nc", "a\nB\nc"))).toEqual(["ctx:a", "del:b", "add:B", "ctx:c"]);
  });

  it("treats a first version as entirely added", () => {
    expect(diffStat(diffLines("", "a\nb"))).toEqual({ added: 2, removed: 1 });
  });

  it("carries line numbers from the side each row belongs to", () => {
    const d = diffLines("a\nb\nc", "a\nc");
    const del = d.find((l) => l.kind === "del")!;
    expect(del.oldLine).toBe(2);
    // A deleted line has no place in the new body, so it carries no new number.
    expect(del.newLine).toBeUndefined();
    expect(d.filter((l) => l.kind === "ctx").at(-1)).toMatchObject({ oldLine: 3, newLine: 2 });
  });

  it("keeps a moved block rather than rewriting the whole body", () => {
    // LCS should find the shared run, not report 6 changes.
    const d = diffLines("x\na\nb\nc", "a\nb\nc\ny");
    expect(diffStat(d)).toEqual({ added: 1, removed: 1 });
  });
});

describe("collapseUnchanged", () => {
  const long = (n: number) => Array.from({ length: n }, (_, i) => `line ${i}`).join("\n");

  it("leaves a short diff alone", () => {
    const rows = collapseUnchanged(diffLines("a\nb", "a\nB"));
    expect(rows.some((r) => r.kind === "gap")).toBe(false);
  });

  it("collapses a long unchanged stretch into one gap row", () => {
    const before = long(60);
    const after = before.replace("line 0", "line ZERO");
    const rows = collapseUnchanged(diffLines(before, after));
    const gaps = rows.filter((r) => r.kind === "gap");
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ count: 57 });
  });

  it("keeps the requested context either side of a change", () => {
    const rows = collapseUnchanged(diffLines(long(40), long(40).replace("line 20", "changed")), 2);
    const shown = rows.filter((r) => r.kind !== "gap");
    // 2 context + del + add + 2 context
    expect(shown).toHaveLength(6);
  });
});
