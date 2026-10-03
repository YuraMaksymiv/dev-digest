import { describe, it, expect } from "vitest";
import type { ContextAttachment, ContextDoc } from "@devdigest/shared";
import { attachedTokens, buildRows, filterRows, moveRow, toggleRow, toPaths } from "./helpers";

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
