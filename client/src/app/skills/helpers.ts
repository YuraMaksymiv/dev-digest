import type { SkillSummary } from "@devdigest/shared";

/** Pure helpers shared by the /skills rail and editor. */

/** Case-insensitive filter over name + description. Blank query = everything. */
export function filterSkills(skills: SkillSummary[], query: string): SkillSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter(
    (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
  );
}

// Moved to `@/lib/token-estimate` once the agent editor's system prompt became
// a second consumer in another route; re-exported so these files' imports and
// their tests stay unchanged.
export { approxTokens } from "@/lib/token-estimate";

/** First non-blank line of a body, for the version list's one-line summary. */
export function firstLine(body: string, max = 80): string {
  const line = body.split("\n").find((l) => l.trim().length > 0)?.trim() ?? "";
  const clean = line.replace(/^#+\s*/, "");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
