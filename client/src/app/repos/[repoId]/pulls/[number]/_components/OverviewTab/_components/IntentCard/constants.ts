import type { IconName } from "@devdigest/ui";
import type { IntentCategory } from "@devdigest/shared";

/** Local category → icon map. `IntentCategory` is an 11-value union distinct
   from `@devdigest/ui`'s 5-value `Category` (findings-scoped) — deliberately
   not reusing `CategoryTag`/`CAT`. */
export const INTENT_CATEGORY_ICON: Record<IntentCategory, IconName> = {
  feat: "Sparkles",
  fix: "Bug",
  refactor: "Workflow",
  perf: "Zap",
  chore: "Wrench",
  docs: "FileText",
  test: "FlaskConical",
  style: "Code",
  build: "Boxes",
  ci: "GitMerge",
  security: "Shield",
};
