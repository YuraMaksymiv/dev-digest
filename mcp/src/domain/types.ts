export type Severity = 'CRITICAL' | 'WARNING' | 'SUGGESTION';
export type RunStatus = 'running' | 'done' | 'failed' | 'cancelled';
export type ResponseFormat = 'concise' | 'detailed';

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export interface RepoRef {
  id: string;
  fullName: string;
}

export interface PrRef {
  prId: string;
  repo: string;
  number: number;
  title: string;
}

export interface StartedRun {
  runId: string;
  agentId: string;
  agentName: string;
}

export interface RunDetail {
  runId: string;
  status: RunStatus;
  agentName: string | null;
  prId: string;
  prNumber: number;
  repo: string;
  durationMs: number | null;
  findingsCount: number | null;
  score: number | null;
  error: string | null;
}

export interface Finding {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  file: string;
  startLine: number;
  endLine: number;
  rationale: string;
  suggestion: string | null;
}

export interface Review {
  runId: string | null;
  kind: string;
  verdict: string | null;
  summary: string | null;
  score: number | null;
  findings: Finding[];
}

export interface Convention {
  category: string;
  rule: string;
  confidence: number;
}

export interface ProgressEvent {
  message: string;
}

/** The route's BlastRadius JSON, kept as received so the tool can relay it verbatim. */
export type BlastRadiusPayload = Record<string, unknown>;

export interface ToolOutput {
  text: string;
  isError: boolean;
}
