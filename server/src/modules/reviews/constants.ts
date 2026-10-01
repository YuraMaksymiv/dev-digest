/**
 * Review module constants.
 */
import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Studio review strategy. 'single-pass' = send the WHOLE diff in ONE LLM call.
 * We deliberately do NOT use 'auto'/map-reduce by default: map-reduce makes one
 * call PER FILE, which is slow and fragile (any single file's transient 5xx
 * fails the entire run) and unnecessary — the whole diff already fits the
 * model's context.
 */
export const REVIEW_STRATEGY = 'single-pass' as const;

// ---- Smart Diff (Files-changed grouping) ----------------------------------

/** Display order for Smart Diff groups — NOT the classification rule order below. */
export const SMART_DIFF_GROUP_ORDER: readonly SmartDiffRole[] = [
  'core',
  'tests',
  'wiring',
  'docs',
  'boilerplate',
];

interface SmartDiffClassifyRule {
  role: SmartDiffRole;
  test: (path: string) => boolean;
}

/**
 * Path → role classifier rules, first match wins. Order here is the MATCH
 * order (boilerplate → tests → wiring → docs), deliberately different from
 * `SMART_DIFF_GROUP_ORDER` (the display order) — `core` is the fallback when
 * nothing matches, so it has no rule of its own.
 *
 * Ordering disambiguates overlapping patterns:
 * - a `.snap` file under `__tests__/` still reads as boilerplate (snapshot
 *   rule runs before the `tests` directory-segment rule).
 * - `.claude/**\/*.md` reads as wiring (`.claude/**` runs before the docs
 *   `*.md` rule).
 * - `e2e/README.md` reads as tests (`e2e/**` runs before the docs rule).
 */
export const SMART_DIFF_CLASSIFY_RULES: readonly SmartDiffClassifyRule[] = [
  // ---- boilerplate ----
  { role: 'boilerplate', test: (p) => /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(p) },
  { role: 'boilerplate', test: (p) => /(^|\/)(dist|build)\//.test(p) },
  { role: 'boilerplate', test: (p) => /(^|\/)__snapshots__\//.test(p) },
  { role: 'boilerplate', test: (p) => /\.snap$/.test(p) },
  { role: 'boilerplate', test: (p) => /\.generated\./.test(p) },
  { role: 'boilerplate', test: (p) => /\.min\.js$/.test(p) },
  // ---- tests ----
  { role: 'tests', test: (p) => /\.test\.tsx?$/.test(p) },
  { role: 'tests', test: (p) => /\.spec\.ts$/.test(p) },
  { role: 'tests', test: (p) => /(^|\/)(test|tests|__tests__)\//.test(p) },
  { role: 'tests', test: (p) => /^e2e\//.test(p) },
  // ---- wiring ----
  { role: 'wiring', test: (p) => /(^|\/)index\.(ts|js)$/.test(p) },
  { role: 'wiring', test: (p) => /\.config\./.test(p) },
  { role: 'wiring', test: (p) => /(^|\/)tsconfig[^/]*\.json$/.test(p) },
  { role: 'wiring', test: (p) => /(^|\/)\.eslintrc/.test(p) },
  { role: 'wiring', test: (p) => /(^|\/)\.env/.test(p) },
  { role: 'wiring', test: (p) => /(^|\/)docker-compose[^/]*\.yml$/.test(p) },
  { role: 'wiring', test: (p) => /^\.github\//.test(p) },
  { role: 'wiring', test: (p) => /^\.claude\//.test(p) },
  // ---- docs ----
  { role: 'docs', test: (p) => /\.md$/i.test(p) },
  { role: 'docs', test: (p) => /(^|\/)docs\//.test(p) },
  { role: 'docs', test: (p) => /(^|\/)README[^/]*$/i.test(p) },
  { role: 'docs', test: (p) => /(^|\/)CHANGELOG[^/]*$/i.test(p) },
  { role: 'docs', test: (p) => /(^|\/)LICENSE[^/]*$/i.test(p) },
];

/** A PR at or above this many changed lines (additions + deletions) is "too big". */
export const SMART_DIFF_BIG_PR_LINES = 500;
