import type { FeatureModelChoice, LLMProvider } from '@devdigest/shared';

export interface BriefLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

export interface TokenCounter {
  count(text: string): number;
}

export interface ModelResolver {
  (workspaceId: string): Promise<FeatureModelChoice>;
}

export interface LlmResolver {
  (provider: FeatureModelChoice['provider']): Promise<LLMProvider>;
}

export type LinkedIssueSignal =
  | { state: 'fetched'; issue: { number: number; title: string; body: string | null } }
  | { state: 'unavailable' | 'absent' };
