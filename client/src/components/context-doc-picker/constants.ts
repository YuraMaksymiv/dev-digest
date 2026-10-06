import type { ContextDocRoot } from "@devdigest/shared";

/** Root type → badge colour. Tokens only, so they switch with `data-theme`. */
export const ROOT_COLORS: Record<ContextDocRoot, string> = {
  specs: "var(--accent)",
  docs: "var(--ok)",
  insights: "var(--warn)",
};

export const ROOT_NAMES: readonly ContextDocRoot[] = ["specs", "docs", "insights"];
