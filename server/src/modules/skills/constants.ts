/** Constants for the skills module. */

/** Initial content version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Skills typed into the studio are `manual`; the other sources arrive by import. */
export const DEFAULT_SKILL_SOURCE = 'manual' as const;

/** URL import: caps that bound a server-side fetch of a user-supplied address. */
export const IMPORT_MAX_BYTES = 256 * 1024;
export const IMPORT_TIMEOUT_MS = 10_000;
export const IMPORT_MAX_REDIRECTS = 3;
