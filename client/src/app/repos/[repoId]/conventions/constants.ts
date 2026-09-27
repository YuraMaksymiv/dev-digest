import type { ConventionCategory } from "@devdigest/shared";

/** Constants for the /repos/:repoId/conventions route. */

/** Triage filter chips, in the order they are shown. */
export const STATUS_FILTERS = ["all", "pending", "accepted", "rejected"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const DEFAULT_FILTER: StatusFilter = "all";

/**
 * Category → accent colour. Tokens only (they switch with `data-theme`). The
 * eight values mirror the wire enum; a category with no strong signal takes
 * `--info`, the neutral grey the design system already uses for that.
 */
export const CATEGORY_COLORS: Record<ConventionCategory, string> = {
  naming: "var(--accent)",
  structure: "var(--ok)",
  error_handling: "var(--crit)",
  async: "var(--warn)",
  typing: "var(--accent)",
  testing: "var(--ok)",
  imports: "var(--info)",
  api: "var(--warn)",
};

/** Confidence above this reads as green, above the lower band as amber. */
export const CONFIDENCE_HIGH = 0.85;
export const CONFIDENCE_MID = 0.65;
