/** Soft cap on one tool response, so a single call never floods the context window. */
export const MAX_OUTPUT_CHARS = 4000;

export const SEVERITY_RANK = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 } as const;

export const RUN_SUMMARY_FINDINGS = 5;
