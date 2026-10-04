export const ONBOARDING_FEATURE_MODEL = 'onboarding' as const;
export const ONBOARDING_SCHEMA_NAME = 'onboarding_tour';
export const ONBOARDING_PROMPT_FILE = 'onboarding.system.md';

/** Reading-path / LLM shortlist size (K). */
export const SHORTLIST_SIZE = 15;
export const MAX_INPUT_TOKENS = 12_000;
export const MAX_OUTPUT_TOKENS = 4_000;
export const LLM_TIMEOUT_MS = 60_000;
/** `0` = exactly one HTTP request: a failure is surfaced, never retried. */
export const LLM_MAX_RETRIES = 0;
export const LLM_TEMPERATURE = 0.2;

export const HOTNESS_WINDOW_DAYS = 90;

export const MAX_ROUTES = 40;
export const MAX_COMMANDS = 30;
export const MAX_SCRIPTS = 12;
export const MAX_CRITICAL_CHAINS = 5;
export const MAX_FIRST_TASK_CANDIDATES = 10;
export const MAX_FIRST_TASKS = 5;
export const MAX_LINK_ITEMS = 8;
export const MAX_TEXT_CHARS = 2_000;
export const MAX_DIAGRAM_CHARS = 4_000;
export const MAX_SUMMARY_CHARS = 6_000;

/** Clone reads. */
export const MAX_README_BYTES = 16_000;
export const MAX_MANIFEST_BYTES = 16_000;
export const MAX_SMALL_FILE_BYTES = 3_000;
export const MAX_SCAN_BYTES = 64_000;
export const MAX_SCAN_FILES = 200;
export const SCAN_CONCURRENCY = 8;

export const README_CANDIDATES = ['README.md', 'readme.md', 'Readme.md', 'README.markdown'] as const;
export const COMPOSE_CANDIDATES = [
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
] as const;
export const ENV_EXAMPLE = '.env.example';
export const PACKAGE_JSON = 'package.json';

export const LOCKFILES: readonly { file: string; install: string; runner: string }[] = [
  { file: 'pnpm-lock.yaml', install: 'pnpm install', runner: 'pnpm run' },
  { file: 'yarn.lock', install: 'yarn install', runner: 'yarn run' },
  { file: 'bun.lockb', install: 'bun install', runner: 'bun run' },
  { file: 'bun.lock', install: 'bun install', runner: 'bun run' },
  { file: 'package-lock.json', install: 'npm install', runner: 'npm run' },
];
export const DEFAULT_PM = { install: 'npm install', runner: 'npm run' } as const;

export const SCRIPT_ORDER = ['dev', 'start', 'build', 'test', 'lint', 'typecheck'] as const;

/** Extra exclusions on top of the facade's junk filter (AC-14 / AC-16). */
export const EXTRA_JUNK_PATTERNS = [
  'node_modules/',
  '/vendor/',
  'vendor/',
  '/dist/',
  '/build/',
  '/.next/',
  '/generated/',
  '.generated.',
  '.min.',
  '.lock',
  'pnpm-lock',
  'package-lock',
  '.snap',
  '/test/',
  '/tests/',
  '.test.',
  '.spec.',
  '.config.',
  '/migrations/',
  '.d.ts',
] as const;

export const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.rb'] as const;
