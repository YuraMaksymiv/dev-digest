import { constants as fsConstants } from 'node:fs';
import { open, lstat, readdir, realpath } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type {
  ContextAttachmentList,
  ContextAttachmentPut,
  ContextDoc,
  ContextDocContent,
  ContextDocList,
  GitClient,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import {
  IGNORE_DIRS,
  LIMITS,
  MAX_FILE_BYTES,
  MAX_LISTED_FILES,
  MAX_TOKENS_PER_DOC,
  MAX_TOTAL_TOKENS,
  READ_CONCURRENCY,
} from './constants.js';
import {
  applyBudget,
  dedupCandidates,
  isBinary,
  rootTypeOf,
  sumTokens,
  truncateHead,
  validateDocPath,
  type Candidate,
} from './helpers.js';
import type { ProjectContextRepository, OwnerKind, RepoRefRow } from './repository.js';
import type {
  ContextLogger,
  ProjectContextResolver,
  RepoSpecsResolver,
  ResolveInput,
  ResolvedProjectContext,
  TokenCounter,
} from './types.js';

export interface ProjectContextDeps {
  repo: ProjectContextRepository;
  git: Pick<GitClient, 'clonePathFor'>;
  tokenizer: TokenCounter;
  log?: ContextLogger;
}

type ReadOutcome =
  | { kind: 'ok'; text: string; fileTruncated: boolean }
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'unreadable' };

const NOOP_LOG: ContextLogger = { info() {}, warn() {} };

function invalidPath(): AppError {
  return new AppError('invalid_path', 'Path must be a repo-relative .md file under specs/, docs/ or insights/', 400);
}

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

export class ProjectContextService implements ProjectContextResolver, RepoSpecsResolver {
  private repo: ProjectContextRepository;
  private git: Pick<GitClient, 'clonePathFor'>;
  private tokenizer: TokenCounter;
  private log: ContextLogger;

  constructor(deps: ProjectContextDeps) {
    this.repo = deps.repo;
    this.git = deps.git;
    this.tokenizer = deps.tokenizer;
    this.log = deps.log ?? NOOP_LOG;
  }

  private count = (s: string) => this.tokenizer.count(s);

  private async requireRepo(workspaceId: string, repoId: string): Promise<RepoRefRow> {
    const repo = await this.repo.getRepoInWorkspace(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }

  private rootFor(repo: RepoRefRow): string {
    return this.git.clonePathFor({ owner: repo.owner, name: repo.name });
  }

  /**
   * Reads one doc with realpath containment evaluated NOW (a symlink swapped
   * in after listing must not escape the clone). Reads at most MAX_FILE_BYTES.
   */
  private async readDoc(root: string, path: string): Promise<ReadOutcome> {
    if (!validateDocPath(path)) return { kind: 'invalid' };
    try {
      const rootReal = await realpath(root);
      const real = await realpath(join(root, path));
      if (!real.startsWith(rootReal + sep)) return { kind: 'invalid' };
      const realRel = relative(rootReal, real).split(sep).join('/');
      if (!validateDocPath(realRel) || realRel.split('/').includes('.git')) return { kind: 'invalid' };
      const pre = await lstat(real);
      if (!pre.isFile()) return { kind: 'unreadable' };
      const fh = await open(real, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
      try {
        const st = await fh.stat();
        if (!st.isFile() || st.dev !== pre.dev || st.ino !== pre.ino) return { kind: 'unreadable' };
        const buf = Buffer.alloc(MAX_FILE_BYTES + 1);
        const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
        const fileTruncated = bytesRead > MAX_FILE_BYTES;
        const text = buf.subarray(0, Math.min(bytesRead, MAX_FILE_BYTES)).toString('utf8');
        if (isBinary(text)) return { kind: 'unreadable' };
        return { kind: 'ok', text, fileTruncated };
      } finally {
        await fh.close();
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return { kind: 'missing' };
      return { kind: 'unreadable' };
    }
  }

  /** Recursive walk; skips symlinks and IGNORE_DIRS. Returns qualifying doc paths. */
  private async walk(root: string): Promise<string[]> {
    const found: string[] = [];
    const visit = async (rel: string): Promise<void> => {
      const entries = await readdir(rel ? join(root, rel) : root, { withFileTypes: true });
      const dirs: string[] = [];
      for (const e of entries) {
        if (e.isSymbolicLink()) continue;
        const childRel = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) {
          if (!IGNORE_DIRS.has(e.name)) dirs.push(childRel);
        } else if (e.isFile() && validateDocPath(childRel)) {
          found.push(childRel);
        }
      }
      await mapLimit(dirs, READ_CONCURRENCY, visit);
    };
    await visit('');
    return found.sort();
  }

  async listDocs(workspaceId: string, repoId: string): Promise<ContextDocList> {
    const started = Date.now();
    const repo = await this.requireRepo(workspaceId, repoId);
    const root = this.rootFor(repo);
    let paths: string[];
    try {
      paths = await this.walk(root);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { docs: [], total_files: 0, total_tokens: 0, truncated: false, reason: 'not_cloned', limits: LIMITS };
      }
      throw err;
    }
    const slice = paths.slice(0, MAX_LISTED_FILES);
    const usedBy = await this.repo.usedByCounts(repoId);
    const docs = await mapLimit(slice, READ_CONCURRENCY, async (path): Promise<ContextDoc> => {
      const outcome = await this.readDoc(root, path);
      let size = 0;
      try {
        size = (await lstat(join(root, path))).size;
      } catch {
        /* vanished mid-walk: size stays 0 */
      }
      const tokens =
        outcome.kind === 'ok' ? truncateHead(outcome.text, MAX_TOKENS_PER_DOC, this.count).tokens : 0;
      return {
        path,
        root_type: rootTypeOf(path) ?? 'docs',
        size_bytes: size,
        tokens,
        used_by: usedBy.get(path) ?? 0,
      };
    });
    this.log.info(
      { repoId, files: paths.length, returned: docs.length, durationMs: Date.now() - started },
      'project-context list',
    );
    return {
      docs,
      total_files: paths.length,
      total_tokens: sumTokens(docs),
      truncated: paths.length > docs.length,
      reason: null,
      limits: LIMITS,
    };
  }

  async readContent(workspaceId: string, repoId: string, path: string): Promise<ContextDocContent> {
    const valid = validateDocPath(path);
    if (!valid) throw invalidPath();
    const repo = await this.requireRepo(workspaceId, repoId);
    const outcome = await this.readDoc(this.rootFor(repo), valid);
    if (outcome.kind === 'missing') throw new NotFoundError('Document not found');
    if (outcome.kind === 'invalid') throw invalidPath();
    if (outcome.kind === 'unreadable') throw new AppError('unreadable', 'Document cannot be read', 422);
    const tokens = truncateHead(outcome.text, MAX_TOKENS_PER_DOC, this.count).tokens;
    return { path: valid, content: outcome.text, tokens };
  }

  async getAttachments(
    workspaceId: string,
    kind: OwnerKind,
    ownerId: string,
    repoId: string,
  ): Promise<ContextAttachmentList> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!(await this.repo.ownerExists(workspaceId, kind, ownerId))) {
      throw new NotFoundError(kind === 'agent' ? 'Agent not found' : 'Skill not found');
    }
    const rows = await this.repo.getAttachments(kind, ownerId, repoId);
    const root = this.rootFor(repo);
    const attachments = await mapLimit(rows, READ_CONCURRENCY, async (r) => {
      const outcome = await this.readDoc(root, r.path);
      return {
        path: r.path,
        position: r.position,
        status: outcome.kind === 'missing' ? ('missing' as const) : ('ok' as const),
        tokens:
          outcome.kind === 'ok' ? truncateHead(outcome.text, MAX_TOKENS_PER_DOC, this.count).tokens : 0,
      };
    });
    return { repo_id: repoId, attachments, limits: LIMITS };
  }

  async putAttachments(
    workspaceId: string,
    kind: OwnerKind,
    ownerId: string,
    body: ContextAttachmentPut,
  ): Promise<ContextAttachmentList> {
    await this.requireRepo(workspaceId, body.repo_id);
    if (!(await this.repo.ownerExists(workspaceId, kind, ownerId))) {
      throw new NotFoundError(kind === 'agent' ? 'Agent not found' : 'Skill not found');
    }
    if (body.paths.length > MAX_LISTED_FILES) throw invalidPath();
    const paths: string[] = [];
    for (const p of body.paths) {
      const valid = validateDocPath(p);
      if (!valid) throw invalidPath();
      paths.push(valid);
    }
    if (new Set(paths).size !== paths.length) throw invalidPath();
    await this.repo.replaceAttachments(kind, ownerId, body.repo_id, paths);
    return this.getAttachments(workspaceId, kind, ownerId, body.repo_id);
  }

  async resolveForRepo(repoId: string): Promise<ResolvedProjectContext> {
    const empty: ResolvedProjectContext = { texts: [], specs_detail: [], specs_read: [] };
    try {
      const repo = await this.repo.getRepoRef(repoId);
      if (!repo) return empty;
      const rows = await this.repo.getEnabledAgentAttachments(repoId);
      const unique = dedupCandidates(
        rows.map((r) => ({ path: r.path, source: 'agent' as const, source_name: null })),
      );
      if (unique.length === 0) return empty;
      const candidates = await this.readCandidates(this.rootFor(repo), repoId, unique);
      return applyBudget(candidates, MAX_TOTAL_TOKENS);
    } catch (err) {
      this.log.warn({ err: (err as Error).message, repoId }, 'project-context repo specs failed (non-fatal)');
      return empty;
    }
  }

  async resolve(input: ResolveInput): Promise<ResolvedProjectContext> {
    const empty: ResolvedProjectContext = { texts: [], specs_detail: [], specs_read: [] };
    try {
      const repo = await this.repo.getRepoRef(input.repoId);
      if (!repo) return empty;
      const [agentRows, skillRows] = await Promise.all([
        this.repo.getAttachments('agent', input.agentId, input.repoId),
        this.repo.getSkillAttachments(input.skills.map((s) => s.id), input.repoId),
      ]);
      const refs: { path: string; source: 'agent' | 'skill'; source_name: string | null }[] = [
        ...agentRows.map((r) => ({ path: r.path, source: 'agent' as const, source_name: null })),
      ];
      for (const skill of input.skills) {
        for (const r of skillRows.get(skill.id) ?? []) {
          refs.push({ path: r.path, source: 'skill', source_name: skill.name });
        }
      }
      const unique = dedupCandidates(refs);
      if (unique.length === 0) return empty;

      const candidates = await this.readCandidates(this.rootFor(repo), input.repoId, unique);
      const result = applyBudget(candidates, MAX_TOTAL_TOKENS);
      this.log.info(
        {
          repoId: input.repoId,
          agentId: input.agentId,
          attached: unique.length,
          injected: result.specs_read.length,
        },
        'project-context resolved',
      );
      return result;
    } catch (err) {
      this.log.warn({ err: (err as Error).message, repoId: input.repoId }, 'project-context resolve failed (non-fatal)');
      return empty;
    }
  }

  private readCandidates(
    root: string,
    repoId: string,
    unique: { path: string; source: 'agent' | 'skill'; source_name: string | null }[],
  ): Promise<Candidate[]> {
    return mapLimit(unique, READ_CONCURRENCY, async (ref): Promise<Candidate> => {
      const outcome = await this.readDoc(root, ref.path);
      if (outcome.kind !== 'ok') {
        const status = outcome.kind === 'missing' ? 'missing' : 'unreadable';
        this.log.info({ repoId, path: ref.path, status, source: ref.source }, 'project-context doc skipped');
        return { ...ref, status, text: '', tokens: 0 };
      }
      const cut = truncateHead(outcome.text, MAX_TOKENS_PER_DOC, this.count, outcome.fileTruncated);
      return {
        ...ref,
        status: cut.truncated || outcome.fileTruncated ? 'truncated' : 'read',
        text: cut.text,
        tokens: cut.tokens,
      };
    });
  }
}
