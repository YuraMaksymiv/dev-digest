import type {
  AgentInfo,
  Convention,
  PrRef,
  ProgressEvent,
  RepoRef,
  Review,
  RunDetail,
  StartedRun,
} from './domain/types.js';

export type ApiErrorKind =
  | 'unreachable'
  | 'timeout'
  | 'not_found'
  | 'bad_request'
  | 'rate_limited'
  | 'server'
  | 'invalid_response';

/** Failure of a DevDigest API call; `message` is already phrased for the model, with a next step. */
export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface WaitForRunOptions {
  signal: AbortSignal;
  onEvent?: (event: ProgressEvent) => void;
}

/** The DevDigest backend as the application layer sees it. */
export interface DevDigestApi {
  listAgents(): Promise<AgentInfo[]>;
  listRepos(): Promise<RepoRef[]>;
  lookupPull(repo: string, number: number): Promise<PrRef>;
  startReview(prId: string, agentId: string): Promise<StartedRun>;
  getRun(runId: string): Promise<RunDetail>;
  listReviews(prId: string): Promise<Review[]>;
  /** Accepted conventions only. */
  listConventions(repoId: string): Promise<Convention[]>;
  /**
   * Resolves 'ended' when the run's event stream completes (the run is
   * finished) and 'aborted' when `signal` fires first. Never cancels the run.
   */
  waitForRun(runId: string, options: WaitForRunOptions): Promise<'ended' | 'aborted'>;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}
