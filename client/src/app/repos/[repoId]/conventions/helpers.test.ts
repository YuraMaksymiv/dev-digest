import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import {
  confidenceColor,
  countByStatus,
  evidenceLabel,
  filterByStatus,
  hasDistinctRationale,
} from "./helpers";

function candidate(over: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: "c1",
    category: "async",
    rule: "Always use async/await instead of .then() chains",
    rationale: null,
    evidence_path: "src/api/users.ts",
    evidence_line: 23,
    evidence_snippet: "const user = await db.users.find(id);",
    confidence: 0.91,
    status: "pending",
    created_at: "2026-09-21T10:00:00.000Z",
    ...over,
  };
}

describe("countByStatus", () => {
  it("counts each triage state and the total", () => {
    expect(
      countByStatus([
        candidate({ id: "a", status: "pending" }),
        candidate({ id: "b", status: "accepted" }),
        candidate({ id: "c", status: "accepted" }),
        candidate({ id: "d", status: "rejected" }),
      ]),
    ).toEqual({ all: 4, pending: 1, accepted: 2, rejected: 1 });
  });

  it("returns zeroes rather than an empty object for no candidates", () => {
    expect(countByStatus([])).toEqual({ all: 0, pending: 0, accepted: 0, rejected: 0 });
  });
});

describe("filterByStatus", () => {
  const list = [
    candidate({ id: "a", status: "pending" }),
    candidate({ id: "b", status: "accepted" }),
  ];

  it("passes everything through on 'all'", () => {
    expect(filterByStatus(list, "all")).toHaveLength(2);
  });

  it("keeps only the matching state", () => {
    expect(filterByStatus(list, "accepted").map((c) => c.id)).toEqual(["b"]);
  });
});

describe("evidenceLabel", () => {
  it("renders path:line when the gate pinned a line", () => {
    expect(evidenceLabel(candidate())).toBe("src/api/users.ts:23");
  });

  it("drops the separator when there is no line, so it cannot read as line 0", () => {
    expect(evidenceLabel(candidate({ evidence_line: null }))).toBe("src/api/users.ts");
  });
});

describe("confidenceColor", () => {
  it("uses the same bands as the design system's confidence readout", () => {
    expect(confidenceColor(0.9)).toBe("var(--ok)");
    expect(confidenceColor(0.7)).toBe("var(--warn)");
    expect(confidenceColor(0.4)).toBe("var(--text-muted)");
  });
});

describe("hasDistinctRationale", () => {
  it("hides a rationale that only echoes the rule back", () => {
    expect(hasDistinctRationale(candidate({ rationale: candidate().rule }))).toBe(false);
  });

  it("ignores casing and punctuation when comparing the two", () => {
    expect(
      hasDistinctRationale(
        candidate({ rationale: "always use async await instead of then chains!" }),
      ),
    ).toBe(false);
  });

  it("keeps a rationale that says something new", () => {
    expect(
      hasDistinctRationale(candidate({ rationale: "Flag a .then() chain in an async function." })),
    ).toBe(true);
  });

  it("treats a missing rationale as nothing to show", () => {
    expect(hasDistinctRationale(candidate({ rationale: null }))).toBe(false);
  });
});
