import { randomBytes } from 'node:crypto';
import {
  OnboardingTour,
  type GitClient,
  type OnboardingResponse,
} from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { renderPrompt } from '../../platform/prompts.js';
import type { IndexState, RepoIntel } from '../repo-intel/types.js';
import { cloneExists, readCloneFile } from './clone.js';
import {
  COMPOSE_CANDIDATES,
  ENV_EXAMPLE,
  HOTNESS_WINDOW_DAYS,
  LLM_MAX_RETRIES,
  LLM_TEMPERATURE,
  LLM_TIMEOUT_MS,
  LOCKFILES,
  MAX_INPUT_TOKENS,
  MAX_MANIFEST_BYTES,
  MAX_OUTPUT_TOKENS,
  MAX_README_BYTES,
  MAX_SCAN_BYTES,
  ONBOARDING_PROMPT_FILE,
  ONBOARDING_SCHEMA_NAME,
  PACKAGE_JSON,
  README_CANDIDATES,
  SCAN_CONCURRENCY,
} from './constants.js';
import {
  buildCommandSet,
  buildSkeleton,
  collectRoutes,
  detectStack,
  findTaskCandidates,
  fitPrompt,
  isStale,
  leafPaths,
  orderScripts,
  parseComposeServices,
  parseEnvKeys,
  parsePackageJson,
  pickPackageManager,
  scoreFiles,
  selectScanTargets,
  topDirs,
  validateLlmTour,
} from './helpers.js';
import type { OnboardingRepository, RepoRefRow, StoredTourRow } from './repository.js';
import { LlmTour } from './schema.js';
import type {
  Facts,
  FileScan,
  IndexSummary,
  LlmResolver,
  ModelResolver,
  OnboardingLogger,
  RankedFile,
  ScoredFile,
  TaskCandidate,
  TokenCounter,
} from './types.js';

export interface OnboardingDeps {
  repo: OnboardingRepository;
  repoIntel: Pick<RepoIntel, 'getIndexState' | 'getRankedFiles' | 'getCriticalPaths' | 'getEndpointFacts'>;
  git: Pick<GitClient, 'clonePathFor'>;
  tokenizer: TokenCounter;
  llm: LlmResolver;
  log?: OnboardingLogger;
  now?: () => Date;
  nonce?: () => string;
}

type Outcome =
  | 'success'
  | 'skipped_no_clone'
  | 'skipped_index_degraded'
  | 'skipped_empty_shortlist'
  | 'skipped_input_too_large'
  | 'llm_failed'
  | 'invalid_output'
  | 'repo_deleted';

type Banner = NonNullable<OnboardingResponse['banner']>;

interface Artifacts {
  ranked: RankedFile[];
  facts: Facts;
  shortlist: ScoredFile[];
  chains: string[][];
  candidates: TaskCandidate[];
  dirs: { dir: string; files: number }[];
  skeleton: OnboardingTour;
}

interface Base {
  ref: RepoRefRow;
  root: string;
  state: IndexState;
  index: IndexSummary;
  stored: StoredTourRow | null;
  storedTour: OnboardingTour | null;
  cloneOk: boolean;
}

const NOOP_LOG: OnboardingLogger = { info() {}, warn() {} };
const DAY_MS = 24 * 60 * 60 * 1000;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function isDegraded(state: IndexState): boolean {
  return state.status === 'degraded' || state.status === 'failed' || state.degraded === true;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('LLM request timed out')), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export class OnboardingService {
  private repo: OnboardingRepository;
  private repoIntel: OnboardingDeps['repoIntel'];
  private git: OnboardingDeps['git'];
  private tokenizer: TokenCounter;
  private llm: LlmResolver;
  private log: OnboardingLogger;
  private now: () => Date;
  private nonce: () => string;
  private inflight = new Map<string, Promise<OnboardingResponse>>();

  constructor(deps: OnboardingDeps) {
    this.repo = deps.repo;
    this.repoIntel = deps.repoIntel;
    this.git = deps.git;
    this.tokenizer = deps.tokenizer;
    this.llm = deps.llm;
    this.log = deps.log ?? NOOP_LOG;
    this.now = deps.now ?? (() => new Date());
    this.nonce = deps.nonce ?? (() => randomBytes(12).toString('hex'));
  }

  async get(workspaceId: string, repoId: string): Promise<OnboardingResponse> {
    const base = await this.loadBase(workspaceId, repoId);
    if (base.storedTour) {
      return this.storedResponse(base, isDegraded(base.state) ? this.degradedBanner(base.state) : null);
    }
    if (!base.cloneOk) return this.noCloneResponse(base);
    const art = await this.buildArtifacts(base);
    return this.skeletonResponse(
      base,
      art,
      isDegraded(base.state) ? this.degradedBanner(base.state) : { kind: 'not_generated', reason: null },
    );
  }

  /** Single-flight per repo: a concurrent call joins the in-flight generation. */
  async generate(
    workspaceId: string,
    repoId: string,
    resolveModel: ModelResolver,
  ): Promise<OnboardingResponse> {
    const key = `${workspaceId}:${repoId}`;
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const run = this.loadBase(workspaceId, repoId)
      .then((base) => this.runGeneration(workspaceId, base, resolveModel))
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, run);
    return run;
  }

  // ------------------------------------------------------------------ run ---

  private async runGeneration(
    workspaceId: string,
    base: Base,
    resolveModel: ModelResolver,
  ): Promise<OnboardingResponse> {
    const started = Date.now();
    const repoId = base.ref.id;
    let model = '';
    const emit = (
      outcome: Outcome,
      usage: { tokensIn: number; tokensOut: number; costUsd: number | null; llmCalls: number } = {
        tokensIn: 0,
        tokensOut: 0,
        costUsd: null,
        llmCalls: 0,
      },
      errorName?: string,
    ) =>
      this.log.info(
        {
          repo_id: repoId,
          model,
          tokens_in: usage.tokensIn,
          tokens_out: usage.tokensOut,
          cost_usd: usage.costUsd,
          llm_calls: usage.llmCalls,
          duration_ms: Date.now() - started,
          outcome,
          ...(errorName ? { error: errorName } : {}),
        },
        'onboarding.generate',
      );

    if (!base.cloneOk) {
      emit('skipped_no_clone');
      return this.fallback(base, null, { kind: 'no_clone', reason: null });
    }
    if (isDegraded(base.state)) {
      emit('skipped_index_degraded');
      return this.fallback(base, null, this.degradedBanner(base.state));
    }

    const art = await this.buildArtifacts(base);
    if (art.shortlist.length === 0) {
      emit('skipped_empty_shortlist');
      return this.fallback(base, art, { kind: 'not_generated', reason: 'no_ranked_files' });
    }

    const nonce = this.nonce();
    const system = await renderPrompt(ONBOARDING_PROMPT_FILE, {});
    const readme = art.facts.readme;
    const fit = fitPrompt(
      system,
      {
        repoName: base.ref.fullName,
        facts: art.facts,
        topDirs: art.dirs,
        shortlist: art.shortlist,
        chains: art.chains,
        candidates: art.candidates,
        readme,
        manifest: art.facts.manifest,
        nonce,
      },
      MAX_INPUT_TOKENS,
      this.tokenizer,
    );
    if (!fit) {
      emit('skipped_input_too_large');
      return this.fallback(base, art, { kind: 'llm_failed', reason: 'input_too_large' });
    }

    let requested = false;
    let spent = { tokensIn: 0, tokensOut: 0, costUsd: null as number | null };
    try {
      const choice = await resolveModel(workspaceId);
      model = choice.model;
      const provider = await this.llm(choice.provider);
      requested = true;
      const res = await withTimeout(
        provider.completeStructured({
          model: choice.model,
          schema: LlmTour,
          schemaName: ONBOARDING_SCHEMA_NAME,
          temperature: LLM_TEMPERATURE,
          maxTokens: MAX_OUTPUT_TOKENS,
          timeoutMs: LLM_TIMEOUT_MS,
          maxRetries: LLM_MAX_RETRIES,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: fit.user },
          ],
        }),
        LLM_TIMEOUT_MS + 2_000,
      );
      spent = { tokensIn: res.tokensIn, tokensOut: res.tokensOut, costUsd: res.costUsd };

      const tour = validateLlmTour(res.data, {
        allowedPaths: new Set(art.ranked.map((r) => r.path)),
        commands: new Set(art.facts.commands),
        skeleton: art.skeleton,
      });
      const usage = {
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        costUsd: res.costUsd,
        llmCalls: res.attempts,
      };
      model = res.model || choice.model;
      const durationMs = Date.now() - started;
      const generatedAt = this.now();
      const generatedSha = base.index.last_indexed_sha;
      const persisted = await this.repo.upsertTour(
        repoId,
        tour,
        { model, ...usage, durationMs },
        generatedSha,
        generatedAt,
      );
      if (!persisted) {
        emit('repo_deleted', usage);
        throw new NotFoundError('Repository not found');
      }
      emit('success', usage);
      return {
        tour,
        source: 'llm',
        banner: null,
        index: base.index,
        generated_at: generatedAt.toISOString(),
        generated_sha: generatedSha,
        stale: false,
        usage: {
          model,
          tokens_in: usage.tokensIn,
          tokens_out: usage.tokensOut,
          cost_usd: usage.costUsd,
          llm_calls: usage.llmCalls,
          duration_ms: durationMs,
        },
      };
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      const invalid = /schema validation/i.test((err as Error)?.message ?? '');
      const kind = invalid ? 'invalid_output' : 'llm_failed';
      emit(kind, { ...spent, llmCalls: requested ? 1 : 0 }, (err as Error)?.name);
      return this.fallback(base, art, { kind, reason: null });
    }
  }

  // ------------------------------------------------------------- responses ---

  private async loadBase(workspaceId: string, repoId: string): Promise<Base> {
    const ref = await this.repo.getRepoInWorkspace(workspaceId, repoId);
    if (!ref) throw new NotFoundError('Repository not found');
    const root = this.git.clonePathFor({ owner: ref.owner, name: ref.name });
    const [state, stored, cloneOk] = await Promise.all([
      this.repoIntel.getIndexState(repoId),
      this.repo.getStored(repoId),
      cloneExists(root),
    ]);
    const parsed = stored ? OnboardingTour.safeParse(stored.json) : null;
    return {
      ref,
      root,
      state,
      stored,
      storedTour: parsed?.success ? parsed.data : null,
      cloneOk,
      index: {
        status: state.status,
        files_indexed: state.filesIndexed,
        files_total: state.filesIndexed + state.filesSkipped,
        last_indexed_sha: state.lastIndexedSha || null,
      },
    };
  }

  private degradedBanner(state: IndexState): Banner {
    return { kind: 'index_degraded', reason: state.degradedReason ?? state.reason ?? null };
  }

  /** Last stored tour, else skeleton, else the no-clone empty state; never a paid call. */
  private async fallback(base: Base, art: Artifacts | null, banner: Banner): Promise<OnboardingResponse> {
    if (base.storedTour) return this.storedResponse(base, banner);
    if (!base.cloneOk) return this.noCloneResponse(base);
    return this.skeletonResponse(base, art ?? (await this.buildArtifacts(base)), banner);
  }

  private storedResponse(base: Base, banner: Banner | null): OnboardingResponse {
    const row = base.stored as StoredTourRow;
    return {
      tour: base.storedTour,
      source: 'llm',
      banner,
      index: base.index,
      generated_at: row.generatedAt.toISOString(),
      generated_sha: row.generatedSha,
      stale: isStale(row.generatedSha, base.index.last_indexed_sha),
      usage:
        row.model !== null
          ? {
              model: row.model,
              tokens_in: row.tokensIn ?? 0,
              tokens_out: row.tokensOut ?? 0,
              cost_usd: row.costUsd,
              llm_calls: row.llmCalls ?? 0,
              duration_ms: row.durationMs ?? 0,
            }
          : null,
    };
  }

  private noCloneResponse(base: Base): OnboardingResponse {
    return {
      tour: null,
      source: 'none',
      banner: { kind: 'no_clone', reason: null },
      index: base.index,
      generated_at: null,
      generated_sha: null,
      stale: false,
      usage: null,
    };
  }

  private skeletonResponse(base: Base, art: Artifacts, banner: Banner): OnboardingResponse {
    return {
      tour: art.skeleton,
      source: 'skeleton',
      banner,
      index: base.index,
      generated_at: null,
      generated_sha: null,
      stale: false,
      usage: null,
    };
  }

  // ----------------------------------------------------------------- facts ---

  private async buildArtifacts(base: Base): Promise<Artifacts> {
    const repoId = base.ref.id;
    const since = new Date(this.now().getTime() - HOTNESS_WINDOW_DAYS * DAY_MS);
    const [ranked, touches, chains, factRows] = await Promise.all([
      this.repoIntel.getRankedFiles(repoId),
      this.repo.getPrTouches(repoId, since),
      this.repoIntel.getCriticalPaths(repoId),
      this.repoIntel.getEndpointFacts(repoId),
    ]);
    const paths = ranked.map((r) => r.path);
    const allPaths = new Set(paths);
    const shortlist = scoreFiles(ranked, touches);

    const [facts, scans] = await Promise.all([
      this.collectFacts(base.root, paths, collectRoutes(factRows)),
      this.scanFiles(base.root, ranked),
    ]);
    const candidates = findTaskCandidates(scans, allPaths, leafPaths(ranked));
    const dirs = topDirs(paths);
    return {
      ranked,
      facts,
      shortlist,
      chains,
      candidates,
      dirs,
      skeleton: buildSkeleton({ facts, topDirs: dirs, shortlist, chains, candidates }),
    };
  }

  private async collectFacts(root: string, paths: string[], routes: string[]): Promise<Facts> {
    const first = async (names: readonly string[], max: number) => {
      for (const n of names) {
        const r = await readCloneFile(root, n, max);
        if (r.kind === 'ok') return { name: n, text: r.text };
      }
      return null;
    };
    const [manifest, readme, env, compose, lockHits] = await Promise.all([
      readCloneFile(root, PACKAGE_JSON, MAX_MANIFEST_BYTES),
      first(README_CANDIDATES, MAX_README_BYTES),
      readCloneFile(root, ENV_EXAMPLE, MAX_MANIFEST_BYTES),
      first(COMPOSE_CANDIDATES, MAX_MANIFEST_BYTES),
      Promise.all(LOCKFILES.map(async (l) => ((await readCloneFile(root, l.file, 1)).kind === 'ok' ? l.file : null))),
    ]);
    const parsed = manifest.kind === 'ok' ? parsePackageJson(manifest.text) : { scripts: [], deps: [] };
    const pm = pickPackageManager(new Set(lockHits.filter((x): x is string => !!x)), manifest.kind === 'ok');
    const scripts = orderScripts(parsed.scripts);
    const composeServices = compose ? parseComposeServices(compose.text) : [];
    const envKeys = env.kind === 'ok' ? parseEnvKeys(env.text) : [];
    return {
      stack: detectStack(parsed.deps, paths),
      top_dirs: topDirs(paths).map((d) => d.dir),
      install: pm?.install ?? null,
      scripts,
      env_keys: envKeys,
      compose_services: composeServices,
      commands: buildCommandSet({
        hasEnvExample: env.kind === 'ok',
        pm,
        scripts,
        composeServices,
      }),
      routes,
      has_readme: readme !== null,
      readme: readme?.text ?? null,
      manifest: manifest.kind === 'ok' ? manifest.text : null,
    };
  }

  private async scanFiles(root: string, ranked: RankedFile[]): Promise<FileScan[]> {
    const targets = selectScanTargets(ranked);
    const out = await mapLimit(targets, SCAN_CONCURRENCY, async (path): Promise<FileScan | null> => {
      const r = await readCloneFile(root, path, MAX_SCAN_BYTES);
      if (r.kind !== 'ok') return null;
      return { path, size: r.size, has_todo: /\b(?:TODO|FIXME)\b/.test(r.text) };
    });
    return out.filter((x): x is FileScan => x !== null);
  }
}
