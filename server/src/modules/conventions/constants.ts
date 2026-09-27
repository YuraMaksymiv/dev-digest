/**
 * Constants for the conventions extractor.
 *
 * The sizes here are the whole cost control: sampling is deterministic code,
 * so what the model sees — and therefore what one scan costs — is fixed by
 * this file rather than by whatever the repo happens to contain.
 */

/**
 * Config and doc files worth sending verbatim: they state conventions the
 * source only implies. Missing ones are skipped silently — most repos have a
 * handful of these at most.
 */
export const CONFIG_SAMPLE_PATHS = [
  'package.json',
  'tsconfig.json',
  '.editorconfig',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.cjs',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  '.prettierrc',
  '.prettierrc.json',
  'prettier.config.js',
  'biome.json',
  'CONTRIBUTING.md',
  'CLAUDE.md',
  'AGENTS.md',
] as const;

/** Top-ranked source files pulled from repo-intel alongside the configs. */
export const TOP_FILE_SAMPLE_COUNT = 12;

/** Per-file caps. A file longer than this is cut, not dropped. */
export const MAX_LINES_PER_FILE = 220;
export const MAX_CHARS_PER_FILE = 12_000;

/** Whole-sample cap. Files are added until this is reached, then it stops. */
export const MAX_SAMPLE_CHARS = 90_000;

/** Upper bound on what one scan proposes, enforced in the prompt and in code. */
export const MAX_CANDIDATES = 12;

/**
 * A snippet shorter than this proves nothing — `}` or `);` appears in every
 * file, so it would pass the "is it in the file" check while identifying
 * nothing. Counted in non-whitespace characters.
 */
export const MIN_SNIPPET_CHARS = 8;

/**
 * Two rules count as the same when their word sets overlap this much. Pure
 * string equality misses "Use async/await over .then()" vs "Prefer async/await
 * instead of .then() chains", which one scan returns both of often enough to
 * matter.
 */
export const DUPLICATE_SIMILARITY = 0.8;

/** Near-deterministic: the sample is fixed, so the scan should be too. */
export const EXTRACTION_TEMPERATURE = 0.1;

/** The feature's entry in the Settings → Feature Models registry. */
export const CONVENTIONS_FEATURE_MODEL = 'conventions' as const;

/** Every extracted skill is typed `convention` and marked machine-extracted. */
export const SKILL_TYPE = 'convention' as const;
export const SKILL_SOURCE = 'extracted' as const;
