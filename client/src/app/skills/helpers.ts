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

/**
 * Rough token count for the body-size hint. The client has no tokenizer, so
 * this is the same chars/4 approximation the server falls back to — which is
 * why every label that shows it is prefixed with `~`.
 */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** First non-blank line of a body, for the version list's one-line summary. */
export function firstLine(body: string, max = 80): string {
  const line = body.split("\n").find((l) => l.trim().length > 0)?.trim() ?? "";
  const clean = line.replace(/^#+\s*/, "");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
