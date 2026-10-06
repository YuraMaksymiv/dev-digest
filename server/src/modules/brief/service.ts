import { randomBytes } from 'node:crypto';
import {
  PrBriefModelOutput,
  type BlastRadius,
  type PrBrief,
  type PrBriefResponse,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { renderPrompt } from '../../platform/prompts.js';
import type { ResolvedProjectContext } from '../project-context/types.js';
import type { PullRow, RepoRow, ReviewRepository } from '../reviews/repository.js';
import type { BriefRepository } from './repository.js';
import {
  BRIEF_PROMPT_FILE,
  BRIEF_SCHEMA_NAME,
  LLM_MAX_RETRIES,
  LLM_TEMPERATURE,
  LLM_TIMEOUT_MS,
  MAX_OUTPUT_TOKENS,
} from './constants.js';
import {
  blastFiles,
  buildBriefPrompt,
  computeMissingInputs,
  parseHunkRanges,
  validateBrief,
} from './helpers.js';
import type {
  BriefLogger,
  LinkedIssueSignal,
  LlmResolver,
  ModelResolver,
  TokenCounter,
} from './types.js';

export interface BriefDeps {
  repo: Pick<BriefRepository, 'get' | 'upsert'>;
  reviewRepo: Pick<
    ReviewRepository,
    'getPull' | 'getRepo' | 'getPrFiles' | 'getIntent' | 'createAgentRun' | 'completeAgentRun'
  >;
  blast: { getBlast(workspaceId: string, prId: string): Promise<BlastRadius> };
  linkedIssue: (repo: RepoRow, pull: PullRow) => Promise<LinkedIssueSignal>;
  specs: { resolveForRepo(repoId: string): Promise<ResolvedProjectContext> };
  tokenizer: TokenCounter;
  llm: LlmResolver;
  log?: BriefLogger;
  now?: () => Date;
  nonce?: () => string;
}

const NOOP_LOG: BriefLogger = { info() {}, warn() {} };

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('LLM request timed out')), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export class BriefService {
  private repo: BriefDeps['repo'];
  private reviewRepo: BriefDeps['reviewRepo'];
  private blast: BriefDeps['blast'];
  private linkedIssue: BriefDeps['linkedIssue'];
  private specs: BriefDeps['specs'];
  private tokenizer: TokenCounter;
  private llm: LlmResolver;
  private log: BriefLogger;
  private now: () => Date;
  private nonce: () => string;
  private inflight = new Map<string, Promise<PrBriefResponse>>();

  constructor(deps: BriefDeps) {
    this.repo = deps.repo;
    this.reviewRepo = deps.reviewRepo;
    this.blast = deps.blast;
    this.linkedIssue = deps.linkedIssue;
    this.specs = deps.specs;
    this.tokenizer = deps.tokenizer;
    this.llm = deps.llm;
    this.log = deps.log ?? NOOP_LOG;
    this.now = deps.now ?? (() => new Date());
    this.nonce = deps.nonce ?? (() => randomBytes(12).toString('hex'));
  }

  /** Cached brief only: DB reads, never a model or GitHub call. */
  async get(workspaceId: string, prId: string): Promise<PrBriefResponse | null> {
    const pull = await this.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const brief = await this.repo.get(prId);
    if (!brief) return null;
    return { ...brief, stale: brief.head_sha !== pull.headSha };
  }

  /** Single-flight per workspace+PR: a concurrent call joins the in-flight generation. */
  generate(workspaceId: string, prId: string, resolveModel: ModelResolver): Promise<PrBriefResponse> {
    const key = `${workspaceId}:${prId}`;
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const run = this.run(workspaceId, prId, resolveModel).finally(() => this.inflight.delete(key));
    this.inflight.set(key, run);
    return run;
  }

  private async run(workspaceId: string, prId: string, resolveModel: ModelResolver): Promise<PrBriefResponse> {
    const started = Date.now();
    const pull = await this.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repoRow = await this.reviewRepo.getRepo(pull.repoId);

    const [files, intent, blastRes, issue, specs] = await Promise.all([
      this.reviewRepo.getPrFiles(prId),
      this.reviewRepo.getIntent(prId),
      this.blast.getBlast(workspaceId, prId).then(
        (b) => b,
        () => null,
      ),
      repoRow ? this.linkedIssue(repoRow, pull) : Promise.resolve<LinkedIssueSignal>({ state: 'absent' }),
      this.specs.resolveForRepo(pull.repoId),
    ]);

    const missing = computeMissingInputs({
      intent: !!intent,
      blast: blastRes === null ? 'failed' : blastRes.degraded ? 'degraded' : 'ok',
      linkedIssue: issue.state,
      hasSpecs: specs.texts.length > 0,
      description: pull.body,
    });

    const prompt = buildBriefPrompt(
      {
        number: pull.number,
        title: pull.title,
        description: pull.body,
        intent: intent ?? null,
        linkedIssue: issue.state === 'fetched' ? issue.issue : null,
        blast:
          blastRes && (blastRes.changed_symbols.length > 0 || blastRes.downstream.length > 0) ? blastRes : null,
        files: files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions, patch: f.patch })),
        specs: specs.texts,
      },
      this.nonce(),
      (s) => this.tokenizer.count(s),
    );

    const choice = await resolveModel(workspaceId);
    const provider = await this.llm(choice.provider);
    const system = await renderPrompt(BRIEF_PROMPT_FILE, {});
    const runId = await this.reviewRepo.createAgentRun({
      workspaceId,
      agentId: null,
      prId,
      provider: choice.provider,
      model: choice.model,
    });

    let model = choice.model;
    try {
      const res = await withTimeout(
        provider.completeStructured({
          model: choice.model,
          schema: PrBriefModelOutput,
          schemaName: BRIEF_SCHEMA_NAME,
          temperature: LLM_TEMPERATURE,
          maxTokens: MAX_OUTPUT_TOKENS,
          timeoutMs: LLM_TIMEOUT_MS,
          maxRetries: LLM_MAX_RETRIES,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt.user },
          ],
        }),
        LLM_TIMEOUT_MS + 2_000,
      );
      model = res.model || choice.model;

      const ranges = new Map(files.map((f) => [f.path, parseHunkRanges(f.patch)] as const));
      const { data, dropped } = validateBrief(res.data, {
        prFiles: new Set(files.map((f) => f.path)),
        blastFiles: blastFiles(blastRes),
        ranges,
      });
      const brief: PrBrief = {
        ...data,
        head_sha: pull.headSha,
        generated_at: this.now().toISOString(),
        model,
        tokens_in: res.tokensIn,
        tokens_out: res.tokensOut,
        cost_usd: res.costUsd,
        missing_inputs: missing,
      };
      await this.repo.upsert(prId, brief);
      await this.reviewRepo.completeAgentRun(runId, {
        status: 'done',
        durationMs: Date.now() - started,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        findingsCount: 0,
        grounding: 'n/a',
        costUsd: res.costUsd,
        error: null,
      });
      this.log.info(
        {
          pr_id: prId,
          model,
          tokens_in: res.tokensIn,
          tokens_out: res.tokensOut,
          cost_usd: res.costUsd,
          input_tokens: prompt.tokens,
          dropped_risks: dropped.risks,
          dropped_focus: dropped.focus,
          cleared_lines: dropped.lines,
          duration_ms: Date.now() - started,
          outcome: 'success',
        },
        'brief.generate',
      );
      return { ...brief, stale: false };
    } catch (err) {
      const message = (err as Error)?.message ?? 'unknown error';
      await this.reviewRepo
        .completeAgentRun(runId, {
          status: 'failed',
          durationMs: Date.now() - started,
          tokensIn: 0,
          tokensOut: 0,
          findingsCount: 0,
          grounding: 'n/a',
          error: message,
        })
        .catch(() => undefined);
      this.log.warn(
        {
          pr_id: prId,
          model,
          duration_ms: Date.now() - started,
          outcome: 'failed',
          error: (err as Error)?.name,
          message,
        },
        'brief.generate',
      );
      throw new AppError('brief_generation_failed', 'Brief generation failed. Try again.', 502);
    }
  }
}
