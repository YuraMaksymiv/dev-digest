import type { ContextDocRoot, ContextLimits } from '@devdigest/shared';

/** Folder names a doc must sit under (any path segment) to be attachable. */
export const ROOTS: readonly ContextDocRoot[] = ['specs', 'docs', 'insights'];

export const DOC_EXTENSION = '.md';

/** Directories never walked when listing the clone. */
export const IGNORE_DIRS: ReadonlySet<string> = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  'vendor',
]);

export const MAX_TOKENS_PER_DOC = 4000;
export const MAX_TOTAL_TOKENS = 10000;
export const MAX_LISTED_FILES = 500;
export const MAX_FILE_BYTES = 64 * 1024;
export const READ_CONCURRENCY = 8;

export const LIMITS: ContextLimits = {
  per_doc_tokens: MAX_TOKENS_PER_DOC,
  total_tokens: MAX_TOTAL_TOKENS,
};
