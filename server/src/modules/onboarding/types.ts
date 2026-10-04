import type { FeatureModelChoice, LLMProvider } from '@devdigest/shared';
import type { IndexStatus } from '../repo-intel/types.js';

/** Pino-compatible `(obj, msg)` logger. */
export interface OnboardingLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

export interface TokenCounter {
  count(text: string): number;
}

export interface RankedFile {
  path: string;
  rank: number;
}

export interface ScoredFile {
  path: string;
  score: number;
}

export interface Facts {
  stack: string[];
  top_dirs: string[];
  install: string | null;
  scripts: { name: string; body: string }[];
  env_keys: string[];
  compose_services: string[];
  commands: string[];
  routes: string[];
  has_readme: boolean;
  readme: string | null;
  manifest: string | null;
}

export type CandidateReason = 'todo' | 'no_test' | 'small_leaf';

export interface TaskCandidate {
  path: string;
  reasons: CandidateReason[];
}

export interface FileScan {
  path: string;
  size: number;
  has_todo: boolean;
}

export interface IndexSummary {
  status: IndexStatus;
  files_indexed: number;
  files_total: number;
  last_indexed_sha: string | null;
}

/** Ports the service needs from the composition root. */
export interface ModelResolver {
  (workspaceId: string): Promise<FeatureModelChoice>;
}
export interface LlmResolver {
  (provider: FeatureModelChoice['provider']): Promise<LLMProvider>;
}
