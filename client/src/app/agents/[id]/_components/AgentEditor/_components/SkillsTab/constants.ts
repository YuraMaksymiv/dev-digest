import type { SkillType } from "@devdigest/shared";

/** Constants for the agent's Skills tab. */

/**
 * Type → accent colour, mirroring the /skills rail. Tokens only, so both themes
 * follow `data-theme`.
 */
export const TYPE_COLORS: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--ok)",
  security: "var(--crit)",
  custom: "var(--info)",
};
