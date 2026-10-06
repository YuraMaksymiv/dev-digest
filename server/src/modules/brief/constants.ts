/** Constants for the brief module (PR Why + Risk Brief). */

export const BRIEF_SCHEMA_NAME = 'pr_brief';
export const BRIEF_PROMPT_FILE = 'brief.system.md';

export const LLM_MAX_RETRIES = 0;
export const LLM_TEMPERATURE = 0.2;
export const LLM_TIMEOUT_MS = 60_000;
export const MAX_OUTPUT_TOKENS = 1500;

/** Whole user message, counted with `container.tokenizer.count`. */
export const MAX_INPUT_TOKENS = 8000;

export const MAX_TITLE_CHARS = 300;
export const MAX_DESCRIPTION_TOKENS = 1000;
export const MAX_INTENT_TOKENS = 500;
export const MAX_ISSUE_TOKENS = 800;
export const MAX_BLAST_TOKENS = 1000;
export const MAX_DIFF_TOKENS = 1700;
export const MAX_SPEC_DOC_TOKENS = 1500;
export const MAX_SPECS_TOKENS = 3000;

export const MAX_DIFF_FILES = 150;
export const MAX_BLAST_CALLERS = 20;
export const MAX_RANGES_PER_FILE = 15;

export const TRUNCATED_MARKER = '[truncated]';
