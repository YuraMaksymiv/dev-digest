import { describe, it, expect } from "vitest";
import type { SkillSummary } from "@devdigest/shared";
import { approxTokens, filterSkills, firstLine } from "./helpers";

const SKILLS: SkillSummary[] = [
  {
    id: "s1",
    name: "no-then-chains",
    description: "When the diff adds a .then() chain, require async/await.",
    type: "convention",
    source: "manual",
    body: "…",
    enabled: true,
    version: 1,
    evidence_files: null,
    used_by: 2,
  },
  {
    id: "s2",
    name: "secret-leakage-gate",
    description: "When the diff adds a credential, say what to rotate.",
    type: "security",
    source: "manual",
    body: "…",
    enabled: true,
    version: 1,
    evidence_files: null,
    used_by: 0,
  },
];

describe("filterSkills", () => {
  it("returns everything for a blank or whitespace query", () => {
    expect(filterSkills(SKILLS, "")).toHaveLength(2);
    expect(filterSkills(SKILLS, "   ")).toHaveLength(2);
  });

  it("matches the name case-insensitively", () => {
    expect(filterSkills(SKILLS, "SECRET").map((s) => s.id)).toEqual(["s2"]);
  });

  it("matches the description too, not just the name", () => {
    expect(filterSkills(SKILLS, "rotate").map((s) => s.id)).toEqual(["s2"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterSkills(SKILLS, "zzz")).toHaveLength(0);
  });
});

describe("approxTokens", () => {
  it("approximates four characters per token, rounding up", () => {
    expect(approxTokens("")).toBe(0);
    expect(approxTokens("abc")).toBe(1);
    expect(approxTokens("abcd")).toBe(1);
    expect(approxTokens("abcde")).toBe(2);
  });
});

describe("firstLine", () => {
  it("skips blank lines and strips the markdown heading marker", () => {
    expect(firstLine("\n\n## Promise chains\nrest")).toBe("Promise chains");
  });

  it("truncates with an ellipsis past the limit", () => {
    expect(firstLine("a".repeat(100), 10)).toBe(`${"a".repeat(9)}…`);
  });

  it("returns an empty string for an empty body", () => {
    expect(firstLine("   \n  ")).toBe("");
  });
});
