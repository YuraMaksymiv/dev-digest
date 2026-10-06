import type { OnboardingTour } from '@devdigest/shared';
import {
  DEFAULT_PM,
  EXTRA_JUNK_PATTERNS,
  LOCKFILES,
  MAX_COMMANDS,
  MAX_CRITICAL_CHAINS,
  MAX_DIAGRAM_CHARS,
  MAX_FIRST_TASKS,
  MAX_FIRST_TASK_CANDIDATES,
  MAX_LINK_ITEMS,
  MAX_ROUTES,
  MAX_SCAN_FILES,
  MAX_SCRIPTS,
  MAX_SMALL_FILE_BYTES,
  MAX_SUMMARY_CHARS,
  MAX_TEXT_CHARS,
  SCRIPT_ORDER,
  SHORTLIST_SIZE,
  SOURCE_EXTENSIONS,
} from './constants.js';
import type { LlmTour } from './schema.js';
import type {
  CandidateReason,
  FileScan,
  Facts,
  RankedFile,
  ScoredFile,
  TaskCandidate,
  TokenCounter,
} from './types.js';

/**
 * Pure domain slice of the onboarding tour: facts parsing, ranking, skeleton,
 * output validation, prompt assembly. No I/O — file bytes and the clock arrive
 * as arguments.
 */

// ---------------------------------------------------------------- paths -----

/** Repo-relative path that is safe to join onto the clone root. */
export function isSafeRelPath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0 || path.length > 1024) return false;
  if (path.includes('\0') || path.includes('\\')) return false;
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return false;
  const segs = path.split('/');
  return !segs.some((s) => s === '' || s === '.' || s === '..' || s.toLowerCase() === '.git');
}

/** Test/config/generated/migration/vendor/lock paths (reading path + first tasks). */
export function isJunkPath(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower.startsWith('vendor/') || lower.startsWith('dist/') || lower.startsWith('build/')) return true;
  if (lower.startsWith('test/') || lower.startsWith('tests/') || lower.startsWith('migrations/')) return true;
  return EXTRA_JUNK_PATTERNS.some((p) => lower.includes(p));
}

function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot).toLowerCase();
}

function isSourceFile(path: string): boolean {
  return (SOURCE_EXTENSIONS as readonly string[]).includes(extOf(path));
}

// ---------------------------------------------------------------- facts -----

export interface ParsedManifest {
  scripts: { name: string; body: string }[];
  deps: string[];
}

export function parsePackageJson(text: string): ParsedManifest {
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const scriptsRaw = (json.scripts ?? {}) as Record<string, unknown>;
    const scripts = Object.entries(scriptsRaw)
      .filter(([, v]) => typeof v === 'string')
      .map(([name, body]) => ({ name, body: body as string }));
    const deps = new Set<string>();
    for (const key of ['dependencies', 'devDependencies']) {
      const group = json[key];
      if (group && typeof group === 'object') for (const d of Object.keys(group)) deps.add(d);
    }
    return { scripts, deps: [...deps].sort() };
  } catch {
    return { scripts: [], deps: [] };
  }
}

/** KEYS only — values are never read into the result. */
export function parseEnvKeys(text: string): string[] {
  const keys = new Set<string>();
  for (const raw of text.split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(raw);
    if (m?.[1]) keys.add(m[1]);
  }
  return [...keys].sort();
}

/** Top-level `services:` keys of a compose file (indent-based, no YAML dependency). */
export function parseComposeServices(text: string): string[] {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^services\s*:\s*$/.test(l));
  if (start === -1) return [];
  const out = new Set<string>();
  let indent: number | null = null;
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    const lead = line.length - line.trimStart().length;
    if (lead === 0) break;
    indent ??= lead;
    if (lead !== indent) continue;
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*:/.exec(line.trim());
    if (m?.[1]) out.add(m[1]);
  }
  return [...out].sort();
}

export function pickPackageManager(lockfiles: ReadonlySet<string>, hasManifest: boolean) {
  const hit = LOCKFILES.find((l) => lockfiles.has(l.file));
  if (hit) return { install: hit.install, runner: hit.runner };
  return hasManifest ? { ...DEFAULT_PM } : null;
}

export function orderScripts(
  scripts: { name: string; body: string }[],
): { name: string; body: string }[] {
  const rank = (n: string) => {
    const i = (SCRIPT_ORDER as readonly string[]).indexOf(n);
    return i === -1 ? SCRIPT_ORDER.length : i;
  };
  return [...scripts]
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
    .slice(0, MAX_SCRIPTS);
}

export interface CommandInput {
  hasEnvExample: boolean;
  pm: { install: string; runner: string } | null;
  scripts: { name: string }[];
  composeServices: string[];
}

/** The ONLY commands a tour may show; the validation allow-list (AC-19). */
export function buildCommandSet(input: CommandInput): string[] {
  const cmds: string[] = [];
  if (input.hasEnvExample) cmds.push('cp .env.example .env');
  if (input.pm) cmds.push(input.pm.install);
  for (const s of input.composeServices) cmds.push(`docker compose up -d ${s}`);
  if (input.pm) for (const s of input.scripts) cmds.push(`${input.pm.runner} ${s.name}`);
  return [...new Set(cmds)].slice(0, MAX_COMMANDS);
}

const KNOWN_STACK = [
  'next', 'react', 'vue', 'svelte', 'angular', 'fastify', 'express', 'koa', 'nestjs', 'hono',
  'drizzle-orm', 'prisma', 'typeorm', 'zod', 'vitest', 'jest', 'playwright', 'tailwindcss',
  'typescript', 'pg', 'redis',
];
const LANGUAGES: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript',
  '.py': 'Python', '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.rb': 'Ruby',
};

export function detectStack(deps: string[], paths: string[]): string[] {
  const counts = new Map<string, number>();
  for (const p of paths) {
    const lang = LANGUAGES[extOf(p)];
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  const langs = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([l]) => l);
  const depSet = new Set(deps);
  const libs = KNOWN_STACK.filter((k) => depSet.has(k) || depSet.has(`@${k}/core`));
  return [...new Set([...langs, ...libs])];
}

export function topDirs(paths: string[], limit = 8): { dir: string; files: number }[] {
  const counts = new Map<string, number>();
  for (const p of paths) {
    const i = p.indexOf('/');
    if (i > 0) counts.set(p.slice(0, i), (counts.get(p.slice(0, i)) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([dir, files]) => ({ dir, files }));
}

/** `file_facts.endpoints` jsonb → deduped "METHOD /path" strings. */
export function collectRoutes(rows: { endpoints: unknown }[]): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    if (!Array.isArray(r.endpoints)) continue;
    for (const e of r.endpoints) if (typeof e === 'string' && e.length <= 200) out.add(e);
  }
  return [...out].sort().slice(0, MAX_ROUTES);
}

// -------------------------------------------------------------- ranking -----

/** Percentile in [0,1] of log1p(touches); 0 for every file when no PR touched anything. */
export function computeHotness(
  paths: string[],
  touches: ReadonlyMap<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  const anyTouch = [...touches.values()].some((n) => n > 0);
  if (!anyTouch || paths.length < 2) {
    for (const p of paths) out.set(p, 0);
    return out;
  }
  const values = paths.map((p) => Math.log1p(touches.get(p) ?? 0));
  const sorted = [...values].sort((a, b) => a - b);
  const strictlyLess = (v: number) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((sorted[mid] as number) < v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  paths.forEach((p, i) => out.set(p, strictlyLess(values[i] as number) / (paths.length - 1)));
  return out;
}

/** score = (rank / max rank) × (1 + hotness); score desc, path asc, junk out, limited. */
export function scoreFiles(
  ranked: RankedFile[],
  touches: ReadonlyMap<string, number>,
  limit = SHORTLIST_SIZE,
): ScoredFile[] {
  const maxRank = ranked.reduce((m, r) => Math.max(m, r.rank), 0);
  const eligible = ranked.filter((r) => !isJunkPath(r.path));
  const hot = computeHotness(eligible.map((r) => r.path), touches);
  return eligible
    .map((r) => ({
      path: r.path,
      score: maxRank > 0 ? (r.rank / maxRank) * (1 + (hot.get(r.path) ?? 0)) : 0,
    }))
    .sort((a, b) => b.score - a.score || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .slice(0, limit);
}

// ---------------------------------------------------------- first tasks -----

/** Lowest-ranked source files are the leaf-like ones worth scanning for TODOs. */
export function selectScanTargets(ranked: RankedFile[], limit = MAX_SCAN_FILES): string[] {
  return ranked
    .filter((r) => !isJunkPath(r.path) && isSourceFile(r.path) && isSafeRelPath(r.path))
    .sort((a, b) => a.rank - b.rank || (a.path < b.path ? -1 : 1))
    .slice(0, limit)
    .map((r) => r.path);
}

export function hasSiblingTest(path: string, allPaths: ReadonlySet<string>): boolean {
  const slash = path.lastIndexOf('/');
  const dir = slash === -1 ? '' : path.slice(0, slash + 1);
  const file = path.slice(slash + 1);
  const dot = file.lastIndexOf('.');
  const stem = dot <= 0 ? file : file.slice(0, dot);
  const ext = dot <= 0 ? '' : file.slice(dot);
  const options = [
    `${dir}${stem}.test${ext}`,
    `${dir}${stem}.spec${ext}`,
    `${dir}__tests__/${stem}.test${ext}`,
    `${dir}__tests__/${stem}${ext}`,
    `${dir}${stem}_test${ext}`,
    `${dir}test_${stem}${ext}`,
  ];
  return options.some((o) => allPaths.has(o));
}

export function findTaskCandidates(
  scans: FileScan[],
  allPaths: ReadonlySet<string>,
  leafPaths: ReadonlySet<string>,
): TaskCandidate[] {
  const out: TaskCandidate[] = [];
  for (const s of scans) {
    if (isJunkPath(s.path) || !isSourceFile(s.path)) continue;
    const reasons: CandidateReason[] = [];
    if (s.has_todo) reasons.push('todo');
    if (!hasSiblingTest(s.path, allPaths)) reasons.push('no_test');
    if (leafPaths.has(s.path) && s.size > 0 && s.size <= MAX_SMALL_FILE_BYTES) reasons.push('small_leaf');
    if (reasons.length > 0) out.push({ path: s.path, reasons });
  }
  return out
    .sort(
      (a, b) =>
        b.reasons.length - a.reasons.length ||
        Number(b.reasons.includes('todo')) - Number(a.reasons.includes('todo')) ||
        (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    )
    .slice(0, MAX_FIRST_TASK_CANDIDATES);
}

const REASON_TEXT: Record<CandidateReason, string> = {
  todo: 'contains a TODO/FIXME marker',
  no_test: 'has no sibling test file',
  small_leaf: 'is a small, rarely imported file',
};

// ------------------------------------------------------------- skeleton -----

const fence = (s: string) => s.replace(/`/g, "'");

export function buildSkeleton(input: {
  facts: Facts;
  topDirs: { dir: string; files: number }[];
  shortlist: ScoredFile[];
  chains: string[][];
  candidates: TaskCandidate[];
}): OnboardingTour {
  const { facts, topDirs: dirs, shortlist, chains, candidates } = input;
  const summary = [
    facts.stack.length ? `**Stack:** ${facts.stack.join(', ')}` : '**Stack:** not detected',
    dirs.length
      ? ['**Top-level directories:**', ...dirs.map((d) => `- \`${fence(d.dir)}/\` (${d.files} indexed files)`)].join('\n')
      : '**Top-level directories:** none detected',
  ].join('\n\n');

  const seen = new Set<string>();
  const critical_paths: OnboardingTour['critical_paths'] = [];
  for (const chain of chains.slice(0, MAX_CRITICAL_CHAINS)) {
    const head = chain[0];
    if (!head || seen.has(head)) continue;
    seen.add(head);
    critical_paths.push({ path: head, reason: `Starts a dependency chain: ${chain.join(' → ')}` });
  }

  const run_steps: OnboardingTour['run_steps'] = facts.commands.map((command) => ({
    command,
    note: commandNote(command, facts),
  }));

  return {
    version: 2,
    architecture: { summary_md: summary, diagram: null },
    critical_paths,
    run_steps,
    reading_path: shortlist.map((f, i) => ({
      path: f.path,
      why: skeletonWhy(i, f.score),
      score: f.score,
    })),
    first_tasks: candidates.map((c) => ({
      title: `Look at ${c.path}`,
      why: `Unranked candidate: ${c.reasons.map((r) => REASON_TEXT[r]).join('; ')}.`,
      files: [c.path],
    })),
  };
}

function skeletonWhy(index: number, score: number): string {
  return `Ranked #${index + 1} by import centrality and recent PR activity (score ${score.toFixed(3)}).`;
}

function commandNote(command: string, facts: Facts): string {
  if (command === 'cp .env.example .env') {
    return facts.env_keys.length
      ? `Create your local env file. Keys: ${facts.env_keys.slice(0, 10).join(', ')}.`
      : 'Create your local env file.';
  }
  if (command.startsWith('docker compose up -d ')) return 'Start this compose service.';
  const script = facts.scripts.find((s) => command.endsWith(` ${s.name}`));
  if (script) return `package.json script: \`${fence(script.body.slice(0, 120))}\``;
  return 'Install dependencies.';
}

// ------------------------------------------------------- post-validation -----

function cleanText(s: unknown, max: number): string {
  return typeof s === 'string' ? s.replace(/\0/g, '').trim().slice(0, max) : '';
}

function cleanDiagram(d: unknown): string | null {
  const s = cleanText(d, MAX_DIAGRAM_CHARS);
  if (!s || s.includes('```')) return null;
  return s;
}

/** Drops unknown paths/commands (AC-19); empty sections fall back to the skeleton (AC-20). */
export function validateLlmTour(
  llm: LlmTour,
  ctx: { allowedPaths: ReadonlySet<string>; commands: ReadonlySet<string>; skeleton: OnboardingTour },
): OnboardingTour {
  const { skeleton } = ctx;
  const summary = cleanText(llm.architecture.summary_md, MAX_SUMMARY_CHARS);

  const seen = new Set<string>();
  const critical_paths: OnboardingTour['critical_paths'] = [];
  for (const c of llm.critical_paths) {
    const reason = cleanText(c.reason, MAX_TEXT_CHARS);
    if (!ctx.allowedPaths.has(c.path) || !reason || seen.has(c.path)) continue;
    seen.add(c.path);
    critical_paths.push({ path: c.path, reason });
    if (critical_paths.length >= MAX_LINK_ITEMS) break;
  }

  const seenCmd = new Set<string>();
  const run_steps: OnboardingTour['run_steps'] = [];
  for (const r of llm.run_steps) {
    const command = typeof r.command === 'string' ? r.command.trim() : '';
    if (!ctx.commands.has(command) || seenCmd.has(command)) continue;
    seenCmd.add(command);
    run_steps.push({ command, note: cleanText(r.note, MAX_TEXT_CHARS) });
  }

  const whyByPath = new Map<string, string>();
  for (const r of llm.reading_path) {
    const why = cleanText(r.why, MAX_TEXT_CHARS);
    if (why && !whyByPath.has(r.path)) whyByPath.set(r.path, why);
  }
  const reading_path = skeleton.reading_path.map((r) => ({ ...r, why: whyByPath.get(r.path) ?? r.why }));

  const first_tasks: OnboardingTour['first_tasks'] = [];
  for (const t of llm.first_tasks) {
    const files = [...new Set(t.files.filter((f) => ctx.allowedPaths.has(f)))];
    const title = cleanText(t.title, 200);
    if (!title || files.length === 0) continue;
    first_tasks.push({ title, why: cleanText(t.why, MAX_TEXT_CHARS), files });
    if (first_tasks.length >= MAX_FIRST_TASKS) break;
  }

  return {
    version: 2,
    architecture: {
      summary_md: summary || skeleton.architecture.summary_md,
      diagram: summary ? cleanDiagram(llm.architecture.diagram) : null,
    },
    critical_paths: critical_paths.length ? critical_paths : skeleton.critical_paths,
    run_steps: run_steps.length ? run_steps : skeleton.run_steps,
    reading_path,
    first_tasks: first_tasks.length ? first_tasks : skeleton.first_tasks,
  };
}

/** `stale` only when both SHAs are known and differ (AC-7). */
export function isStale(generatedSha: string | null, lastIndexedSha: string | null): boolean {
  return !!generatedSha && generatedSha !== lastIndexedSha;
}

// --------------------------------------------------------------- prompt -----

/** Neutralises anything that could close or imitate an untrusted block. */
export function wrapUntrusted(label: string, text: string, nonce: string): string {
  const safe = text.replace(/\0/g, '').replace(/<\/?\s*untrusted[^>]*>/gi, '[tag removed]');
  return `<untrusted-${nonce} source="${label}">\n${safe}\n</untrusted-${nonce}>`;
}

export function truncateChars(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max);
}

export interface PromptInput {
  repoName: string;
  facts: Facts;
  topDirs: { dir: string; files: number }[];
  shortlist: ScoredFile[];
  chains: string[][];
  candidates: TaskCandidate[];
  readme: string | null;
  manifest: string | null;
  nonce: string;
}

export function renderUserPrompt(input: PromptInput): string {
  const { facts } = input;
  const parts: string[] = [
    `Repository: ${input.repoName}`,
    `FACTS (computed by the server):`,
    `- stack: ${facts.stack.join(', ') || 'unknown'}`,
    `- top-level directories: ${input.topDirs.map((d) => `${d.dir}/ (${d.files})`).join(', ') || 'none'}`,
    `- allowed commands (run_steps.command MUST be one of these, verbatim):`,
    ...facts.commands.map((c) => `  - ${c}`),
    `- routes: ${facts.routes.join(', ') || 'none detected'}`,
    `- env keys (names only): ${facts.env_keys.join(', ') || 'none'}`,
    `- critical dependency chains:`,
    ...input.chains.slice(0, MAX_CRITICAL_CHAINS).map((c) => `  - ${c.join(' -> ')}`),
    `- reading shortlist (path, score; describe each in reading_path):`,
    ...input.shortlist.map((f) => `  - ${f.path} (${f.score.toFixed(3)})`),
    `- first-task candidates:`,
    ...input.candidates.map((c) => `  - ${c.path} [${c.reasons.join(', ')}]`),
  ];
  if (input.manifest) parts.push(wrapUntrusted('package.json', input.manifest, input.nonce));
  if (input.readme) parts.push(wrapUntrusted('README', input.readme, input.nonce));
  return parts.join('\n');
}

/**
 * Fits system+user into `budget` tokens. Drop order: README excerpt, manifest
 * excerpt, then the shortlist tail. Null when even a minimal prompt overflows.
 */
export function fitPrompt(
  system: string,
  input: PromptInput,
  budget: number,
  tokenizer: TokenCounter,
): { user: string; shortlist: ScoredFile[] } | null {
  const sysTokens = tokenizer.count(system);
  const fits = (user: string) => sysTokens + tokenizer.count(user) <= budget;
  const cur: PromptInput = { ...input };

  const shrink = (key: 'readme' | 'manifest'): string | null => {
    let text = cur[key];
    while (text) {
      cur[key] = text;
      const user = renderUserPrompt(cur);
      if (fits(user)) return user;
      text = text.length <= 200 ? '' : text.slice(0, Math.floor(text.length / 2));
    }
    cur[key] = null;
    return null;
  };

  const first = renderUserPrompt(cur);
  if (fits(first)) return { user: first, shortlist: cur.shortlist };
  for (const key of ['readme', 'manifest'] as const) {
    const user = shrink(key);
    if (user) return { user, shortlist: cur.shortlist };
  }
  const bare = renderUserPrompt(cur);
  if (fits(bare)) return { user: bare, shortlist: cur.shortlist };
  let list = [...cur.shortlist];
  while (list.length > 0) {
    list = list.slice(0, -1);
    cur.shortlist = list;
    const user = renderUserPrompt(cur);
    if (list.length > 0 && fits(user)) return { user, shortlist: list };
  }
  return null;
}

/** Paths ranked at or below the median — the "leaf-like" half of the graph. */
export function leafPaths(ranked: RankedFile[]): Set<string> {
  if (ranked.length === 0) return new Set();
  const sorted = [...ranked].sort((a, b) => a.rank - b.rank);
  const median = (sorted[Math.floor((sorted.length - 1) / 2)] as RankedFile).rank;
  return new Set(ranked.filter((r) => r.rank <= median).map((r) => r.path));
}
