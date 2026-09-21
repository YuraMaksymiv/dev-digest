import { describe, it, expect } from "vitest";
import type { AgentSkillDetail, SkillSummary } from "@devdigest/shared";
import {
  buildRows,
  countEnabled,
  filterRows,
  moveRow,
  toPayload,
  toggleRow,
  type SkillRowState,
} from "./helpers";

function summary(id: string, name: string, over: Partial<SkillSummary> = {}): SkillSummary {
  return {
    id,
    name,
    description: `When ${name}, do it.`,
    type: "custom",
    source: "manual",
    body: "…",
    enabled: true,
    version: 1,
    evidence_files: null,
    used_by: 0,
    ...over,
  };
}

function link(id: string, order: number, linkEnabled: boolean): AgentSkillDetail {
  return { ...summary(id, id), order, link_enabled: linkEnabled } as AgentSkillDetail;
}

const ALL = [summary("a", "alpha"), summary("b", "beta"), summary("c", "gamma")];

describe("buildRows", () => {
  it("puts linked rows first in their saved order, unlinked ones after, alphabetically", () => {
    const rows = buildRows(ALL, [link("c", 0, true), link("a", 1, false)]);
    expect(rows.map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(rows.map((r) => r.enabled)).toEqual([true, false, false]);
  });

  it("carries the skill's global switch separately from the link's", () => {
    const rows = buildRows([summary("a", "alpha", { enabled: false })], [link("a", 0, true)]);
    expect(rows[0]).toMatchObject({ enabled: true, globallyEnabled: false });
  });

  it("drops a link whose skill no longer exists", () => {
    expect(buildRows(ALL, [link("gone", 0, true)]).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("lists every workspace skill even when the agent links none", () => {
    expect(buildRows(ALL, [])).toHaveLength(3);
  });
});

describe("moveRow", () => {
  const rows = buildRows(ALL, []);

  it("moves a row up", () => {
    expect(moveRow(rows, 2, 1).map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("moves a row down", () => {
    expect(moveRow(rows, 0, 1).map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("clamps at the ends instead of wrapping or dropping the row", () => {
    expect(moveRow(rows, 0, -1).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(moveRow(rows, 2, 9).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("returns the same array reference for a no-op move", () => {
    expect(moveRow(rows, 1, 1)).toBe(rows);
  });
});

describe("toggleRow / countEnabled", () => {
  it("flips only the named row", () => {
    const rows = toggleRow(buildRows(ALL, []), "b", true);
    expect(rows.filter((r) => r.enabled).map((r) => r.id)).toEqual(["b"]);
  });

  it("counts only rows that actually reach the prompt", () => {
    const rows: SkillRowState[] = [
      { id: "a", name: "a", description: "", type: "custom", globallyEnabled: true, enabled: true },
      // Enabled for this agent, but muted globally — it reaches no prompt.
      { id: "b", name: "b", description: "", type: "custom", globallyEnabled: false, enabled: true },
      { id: "c", name: "c", description: "", type: "custom", globallyEnabled: true, enabled: false },
    ];
    expect(countEnabled(rows)).toBe(1);
  });
});

describe("toPayload", () => {
  it("sends every row in order, not just the enabled ones", () => {
    const rows = toggleRow(buildRows(ALL, []), "a", true);
    expect(toPayload(rows)).toEqual([
      { skill_id: "a", enabled: true },
      { skill_id: "b", enabled: false },
      { skill_id: "c", enabled: false },
    ]);
  });
});

describe("filterRows", () => {
  it("matches name and description, case-insensitively", () => {
    const rows = buildRows(ALL, []);
    expect(filterRows(rows, "BET").map((r) => r.id)).toEqual(["b"]);
    expect(filterRows(rows, "when gamma").map((r) => r.id)).toEqual(["c"]);
    expect(filterRows(rows, "")).toHaveLength(3);
  });
});
