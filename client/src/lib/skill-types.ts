import type { SkillType } from "@devdigest/shared";

/**
 * The four skill types, in the order every select offers them.
 *
 * Mirrored here rather than imported from the shared `SkillType` Zod enum:
 * importing a runtime value from `vendor/shared` pulls its whole barrel into
 * the bundle. Shared by the Skills lab and the conventions Create-skill modal.
 */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];
