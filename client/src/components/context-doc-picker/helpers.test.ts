import { describe, it, expect } from "vitest";
import type { ContextAttachment, ContextDoc } from "@devdigest/shared";
import { attachedTokens, buildRows, filterRows, groupSerialized, moveRow, toggleRow, toPaths } from "./helpers";

const doc = (path: string, tokens = 10): ContextDoc => ({
  path,
  root_type: "specs",
  size_bytes: 1,
  tokens,
  used_by: 0,
});
const att = (path: string, position: number, status: "ok" | "missing" = "ok"): ContextAttachment => ({
  path,
  position,
  status,
  tokens: 5,
});

describe("context picker rows", () => {
  const rows = buildRows([doc("specs/b.md"), doc("specs/a.md"), doc("docs/z.md")], [att("specs/b.md", 0)]);

  it("puts attached docs first, then the rest alphabetically", () => {
    expect(rows.map((r) => r.path)).toEqual(["specs/b.md", "docs/z.md", "specs/a.md"]);
    expect(rows[0]).toMatchObject({ attached: true, name: "b.md", folder: "specs/" });
  });

  it("keeps a vanished attachment as a missing row that adds no tokens", () => {
    const r = buildRows([doc("specs/a.md")], [att("specs/gone.md", 0, "missing"), att("specs/a.md", 1)]);
    expect(r[0]).toMatchObject({ path: "specs/gone.md", missing: true, rootType: "specs" });
    expect(attachedTokens(r)).toBe(10);
  });

  it("toggles, reorders and serialises the attached set in row order", () => {
    const next = moveRow(toggleRow(rows, "specs/a.md", true), 2, 0);
    expect(toPaths(next)).toEqual(["specs/a.md", "specs/b.md"]);
    expect(moveRow(rows, 0, -5)).toEqual(rows);
  });

  it("filters by path", () => {
    expect(filterRows(rows, "docs/").map((r) => r.path)).toEqual(["docs/z.md"]);
  });
});

describe("groupSerialized", () => {
  const typed = (path: string, root: "specs" | "docs" | "insights", tokens: number) => ({ ...doc(path, tokens), root_type: root });
  const docs = [
    typed("insights/i.md", "insights", 3),
    typed("docs/d1.md", "docs", 10),
    typed("specs/s.md", "specs", 5),
    typed("docs/d2.md", "docs", 20),
  ];

  it("groups by root in specs, docs, insights order with subtotals and continuous order numbers", () => {
    const rows = buildRows(docs, [att("insights/i.md", 0), att("docs/d1.md", 1), att("specs/s.md", 2), att("docs/d2.md", 3)]);
    const groups = groupSerialized(rows);
    expect(groups.map((g) => [g.group, g.tokens])).toEqual([["specs", 5], ["docs", 30], ["insights", 3]]);
    expect(groups.flatMap((g) => g.entries.map((e) => [e.order, e.path]))).toEqual([
      [1, "specs/s.md"],
      [2, "docs/d1.md"],
      [3, "docs/d2.md"],
      [4, "insights/i.md"],
    ]);
  });

  it("hides empty groups, ignores unattached rows and excludes missing docs", () => {
    const rows = buildRows(docs, [att("docs/d1.md", 0), att("specs/gone.md", 1, "missing")]);
    const groups = groupSerialized(rows);
    expect(groups.map((g) => g.group)).toEqual(["docs"]);
    expect(groups[0]!.tokens).toBe(10);
    expect(groupSerialized(buildRows(docs, []))).toEqual([]);
  });

  it("puts a doc under several roots in the first matching segment's group", () => {
    const rows = buildRows([], [att("docs/specs/x.md", 0)]);
    expect(groupSerialized(rows)[0]!.group).toBe("docs");
  });
});
