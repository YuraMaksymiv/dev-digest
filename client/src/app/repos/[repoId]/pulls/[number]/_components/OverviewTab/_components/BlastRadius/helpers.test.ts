import { describe, it, expect } from "vitest";
import type { BlastRadius } from "@devdigest/shared";
import { blastStats, callerHref } from "./helpers";

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
