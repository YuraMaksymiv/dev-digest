import type {
  AgentInfo,
  Convention,
  PrRef,
  RepoRef,
  Review,
  RunDetail,
  StartedRun,
} from '../domain/types.js';
import type { DevDigestApi, WaitForRunOptions } from '../ports.js';

export const RUN_ID = '11111111-1111-4111-8111-111111111111';
export const PR_ID = '22222222-2222-4222-8222-222222222222';

export const AGENTS: AgentInfo[] = [
  { id: 'a-general', name: 'General Reviewer', description: 'Broad review', enabled: true },
  { id: 'a-security', name: 'Security Reviewer', description: 'Security focus', enabled: true },
];

export function runDetail(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    runId: RUN_ID,
    status: 'done',
    agentName: 'General Reviewer',
    prId: PR_ID,
    prNumber: 7,
    repo: 'acme/widgets',
    durationMs: 1200,
    findingsCount: 0,
    score: 80,
    error: null,
    ...overrides,
  };
}

export function review(findings: Review['findings'], overrides: Partial<Review> = {}): Review {
  return { runId: RUN_ID, kind: 'review', verdict: 'comment', summary: 'Looks mostly fine.', score: 80, findings, ...overrides };
}

type WaitBehavior = (runId: string, options: WaitForRunOptions) => Promise<'ended' | 'aborted'>;

/** Hand-rolled fake: every port method is a replaceable field, calls are recorded. */
export class FakeApi implements DevDigestApi {
  calls: string[] = [];
  agents = AGENTS;
  repos: RepoRef[] = [{ id: 'repo-1', fullName: 'acme/widgets' }];
  pr: PrRef = { prId: PR_ID, repo: 'acme/widgets', number: 7, title: 'Add widgets' };
  run: RunDetail = runDetail();
  reviews: Review[] = [];
  conventions: Convention[] = [];
  wait: WaitBehavior = async () => 'ended';
  lookupError: Error | undefined;
  runError: Error | undefined;

  async listAgents() {
    this.calls.push('listAgents');
    return this.agents;
  }
  async listRepos() {
    this.calls.push('listRepos');
    return this.repos;
  }
  async lookupPull(repo: string, number: number) {
    this.calls.push(`lookupPull ${repo}#${number}`);
    if (this.lookupError) throw this.lookupError;
    return this.pr;
  }
  async startReview(prId: string, agentId: string): Promise<StartedRun> {
    this.calls.push(`startReview ${prId} ${agentId}`);
    return { runId: RUN_ID, agentId, agentName: this.agents.find((a) => a.id === agentId)?.name ?? agentId };
  }
  async getRun(runId: string) {
    this.calls.push(`getRun ${runId}`);
    if (this.runError) throw this.runError;
    return this.run;
  }
  async listReviews(prId: string) {
    this.calls.push(`listReviews ${prId}`);
    return this.reviews;
  }
  async listConventions(repoId: string) {
    this.calls.push(`listConventions ${repoId}`);
    return this.conventions;
  }
  waitForRun(runId: string, options: WaitForRunOptions) {
    this.calls.push(`waitForRun ${runId}`);
    return this.wait(runId, options);
  }
}

/** A wait that never finishes by itself: it resolves 'aborted' only when the signal fires. */
export const hangUntilAbort: WaitBehavior = (_id, { signal }) =>
  new Promise((resolve) => {
    if (signal.aborted) resolve('aborted');
    else signal.addEventListener('abort', () => resolve('aborted'), { once: true });
  });
