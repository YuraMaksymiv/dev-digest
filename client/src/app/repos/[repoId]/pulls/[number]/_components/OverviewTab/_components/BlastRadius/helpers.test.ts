import { describe, it, expect } from "vitest";
import type { BlastRadius } from "@devdigest/shared";
import { blastStats, buildBlastGraph, callerHref, symbolLabel, truncate } from "./helpers";

const BLAST: BlastRadius = {
  changed_symbols: [
    { name: "a", file: "a.ts", kind: "function" },
    { name: "b", file: "b.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "a",
      callers: [
        { name: "x", file: "x.ts", line: 1 },
        { name: "y", file: "y.ts", line: 2 },
      ],
      endpoints_affected: ["GET /a", "GET /b"],
      crons_affected: ["nightly"],
    },
    {
      symbol: "b",
      callers: [{ name: "z", file: "z.ts", line: 3 }],
      endpoints_affected: ["GET /a"],
      crons_affected: [],
    },
  ],
  summary: "s",
};

describe("blastStats", () => {
  it("counts symbols, callers and distinct endpoints/crons", () => {
    expect(blastStats(BLAST)).toEqual({ symbols: 2, callers: 3, endpoints: 2, crons: 1 });
  });
});

describe("callerHref", () => {
  it("pins the link to the head sha and line", () => {
    expect(callerHref("o/r", "abc", "src/x.ts", 7)).toBe(
      "https://github.com/o/r/blob/abc/src/x.ts#L7",
    );
  });
  it("is undefined without a repo or sha", () => {
    expect(callerHref(null, "abc", "x.ts", 1)).toBeUndefined();
    expect(callerHref("o/r", undefined, "x.ts", 1)).toBeUndefined();
  });
});

describe("symbolLabel / truncate", () => {
  it("adds parens only to callable kinds", () => {
    expect(symbolLabel("rateLimit", "function")).toBe("rateLimit()");
    expect(symbolLabel("Client", "class")).toBe("Client");
    expect(symbolLabel("x", undefined)).toBe("x");
  });
  it("ellipsizes past the limit", () => {
    expect(truncate("GET /api/public/items", 10)).toBe("GET /api/…");
    expect(truncate("short", 10)).toBe("short");
  });
});

describe("buildBlastGraph", () => {
  it("lays out symbol, caller and target columns with deduped nodes", () => {
    const g = buildBlastGraph(BLAST, "o/r", "abc");
    const byKind = (k: string) => g.nodes.filter((n) => n.kind === k).map((n) => n.title);
    expect(byKind("symbol")).toEqual(["a()", "b()"]);
    expect(byKind("caller")).toHaveLength(3);
    expect(byKind("endpoint")).toEqual(["GET /a", "GET /b"]);
    expect(byKind("cron")).toEqual(["nightly"]);
    expect(g.nodes.find((n) => n.kind === "caller")?.href).toBe("https://github.com/o/r/blob/abc/x.ts#L1");
  });
  it("links symbol→caller and caller→its group's targets once", () => {
    const g = buildBlastGraph(BLAST);
    expect(g.edges).toContainEqual({ from: "s:a", to: "f:x.ts:x" });
    expect(g.edges).toContainEqual({ from: "f:z.ts:z", to: "e:GET /a" });
    expect(g.edges).not.toContainEqual({ from: "f:z.ts:z", to: "c:nightly" });
    const keys = g.edges.map((e) => `${e.from}→${e.to}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("sizes height to the tallest column", () => {
    const g = buildBlastGraph(BLAST);
    const ys = g.nodes.map((n) => n.y);
    expect(Math.max(...ys)).toBeLessThan(g.height);
    expect(Math.min(...ys)).toBeGreaterThan(0);
  });
});
