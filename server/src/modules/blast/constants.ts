/** Constants for the blast module. */

/**
 * The facade truncates the WHOLE caller list (not per symbol) to this many rows
 * (`MAX_CALLERS_PER_SYMBOL` in repo-intel/service.ts) without signalling it, so
 * a list this long is treated as possibly truncated.
 */
export const BLAST_CALLER_CAP = 20;
