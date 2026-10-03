/**
 * project-context — resolver port. `reviews` codes against this (resolved via
 * `Container.projectContext`), never against the service or repository.
 */
import type { SpecDetail } from '@devdigest/shared';

export interface ResolveInput {
  agentId: string;
  /** The agent's enabled skills, in prompt order. */
  skills: { id: string; name: string }[];
  repoId: string;
}

export interface ResolvedProjectContext {
  /** Capped, deduplicated docs ready for the `specs` prompt slot (in order). */
  texts: { source: string; text: string }[];
  /** One entry per attached doc incl. missing / unreadable / over_budget. */
  specs_detail: SpecDetail[];
  /** Paths actually injected (status `read` or `truncated`). */
  specs_read: string[];
}

export interface ProjectContextResolver {
  /** Fail-soft: never throws; returns empty arrays on any internal error. */
  resolve(input: ResolveInput): Promise<ResolvedProjectContext>;
}

/** Minimal token counter (structurally satisfied by the tokenizer adapter). */
export interface TokenCounter {
  count(text: string): number;
}

/** Pino-compatible `(obj, msg)` logger. */
export interface ContextLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}
