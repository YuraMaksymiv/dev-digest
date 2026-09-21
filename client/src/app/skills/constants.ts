import type { SkillType } from "@devdigest/shared";

/** Shared constants for the /skills routes (rail + editor). */

/** The four skill types, in the order the editor's select offers them. */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/**
 * Type → accent colour. Tokens only (they switch with `data-theme`); `--info`
 * is the neutral grey the design system already uses for "no signal".
 */
export const TYPE_COLORS: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--ok)",
  security: "var(--crit)",
  custom: "var(--info)",
};

export interface EditorTab {
  key: string;
  labelKey: string;
  icon: "Settings" | "Eye" | "History";
}

/**
 * Editor tabs. Evals and per-skill stats arrive with the lessons that give them
 * a data source; a tab of em-dashes would read as unfinished, so they are absent
 * rather than stubbed.
 */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "editor.tabs.preview", icon: "Eye" },
  { key: "versions", labelKey: "editor.tabs.versions", icon: "History" },
];

export const VALID_TABS: readonly string[] = TABS.map((t) => t.key);

export const DEFAULT_TAB = "config";
