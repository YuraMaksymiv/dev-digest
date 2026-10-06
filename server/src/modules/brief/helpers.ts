import type { BlastRadius, Intent, MissingInput, PrBriefModelOutput } from '@devdigest/shared';
import { classifyFile } from '../reviews/helpers.js';
import { truncateHead } from '../project-context/helpers.js';
import {
  MAX_BLAST_CALLERS,
  MAX_BLAST_TOKENS,
  MAX_DESCRIPTION_TOKENS,
  MAX_DIFF_FILES,
  MAX_DIFF_TOKENS,
  MAX_INPUT_TOKENS,
  MAX_INTENT_TOKENS,
  MAX_ISSUE_TOKENS,
  MAX_RANGES_PER_FILE,
  MAX_SPEC_DOC_TOKENS,
  MAX_SPECS_TOKENS,
  MAX_TITLE_CHARS,
  TRUNCATED_MARKER,
} from './constants.js';
import type { LinkedIssueSignal } from './types.js';

/**
 * Pure domain slice of the brief module: hunk-range parsing, prompt building
 * under a token budget, missing-input bookkeeping, and post-validation of the
 * model output. No I/O; the tokenizer arrives as a function.
 */

export interface LineRange {
  start: number;
  end: number;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/** New-side line ranges from the `@@` headers of a patch. Bodies are never read. */
export function parseHunkRanges(patch: string | null | undefined): LineRange[] {
  if (!patch) return [];
  const out: LineRange[] = [];
  for (const line of patch.split('\n')) {
    const m = HUNK_HEADER.exec(line);
    if (!m) continue;
    const start = Number(m[1]);
    const len = m[2] === undefined ? 1 : Number(m[2]);
    if (len > 0) out.push({ start, end: start + len - 1 });
  }
  return out;
}

export function lineInRanges(line: number, ranges: LineRange[]): boolean {
  return ranges.some((r) => line >= r.start && line <= r.end);
}

export interface PrFileLike {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

/** `path · role · +a/-d · lines 1-5, 9` — no hunk bodies. */
export function formatFileStat(f: PrFileLike): string {
  const ranges = parseHunkRanges(f.patch);
  const shown = ranges
    .slice(0, MAX_RANGES_PER_FILE)
    .map((r) => (r.start === r.end ? `${r.start}` : `${r.start}-${r.end}`))
    .join(', ');
  const more = ranges.length > MAX_RANGES_PER_FILE ? ', …' : '';
  const lines = ranges.length === 0 ? 'no line ranges' : `lines ${shown}${more}`;
  return `${f.path} · ${classifyFile(f.path)} · +${f.additions}/-${f.deletions} · ${lines}`;
}

/** Most-churned first; ties by path so the order is deterministic. */
export function sortByChurn<T extends { path: string; additions: number; deletions: number }>(files: T[]): T[] {
  return [...files].sort(
    (a, b) => b.additions + b.deletions - (a.additions + a.deletions) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  );
}

export function blastFiles(blast: BlastRadius | null): Set<string> {
  const out = new Set<string>();
  if (!blast) return out;
  for (const s of blast.changed_symbols) out.add(s.file);
  for (const d of blast.downstream) for (const c of d.callers) out.add(c.file);
  return out;
}

export interface MissingInputState {
  intent: boolean;
  blast: 'ok' | 'degraded' | 'failed';
  linkedIssue: LinkedIssueSignal['state'];
  hasSpecs: boolean;
  description: string | null;
}

export function computeMissingInputs(s: MissingInputState): MissingInput[] {
  const out: MissingInput[] = [];
  if (!s.intent) out.push('intent');
  if (s.blast !== 'ok') out.push('blast');
  if (s.blast === 'degraded') out.push('degraded_blast');
  if (s.linkedIssue !== 'fetched') out.push('linked_issue');
  if (!s.hasSpecs) out.push('specs');
  if (!s.description?.trim()) out.push('description');
  return out;
}

// ------------------------------------------------------------------ prompt ---

export function wrapUntrusted(label: string, text: string, nonce: string): string {
  const safe = text.replace(/\0/g, '').replace(/<\/?\s*untrusted[^>]*>/gi, '[tag removed]');
  const safeLabel = label.replace(/[\s"<>\x00-\x1f\x7f]+/g, '_');
  return `<untrusted-${nonce} source="${safeLabel}">\n${safe}\n</untrusted-${nonce}>`;
}

export interface BriefPromptInput {
  number: number;
  title: string;
  description: string | null;
  intent: Intent | null;
  linkedIssue: { number: number; title: string; body: string | null } | null;
  blast: BlastRadius | null;
  files: PrFileLike[];
  specs: { source: string; text: string }[];
}

export interface BriefPrompt {
  user: string;
  tokens: number;
  omitted: { specs: number; files: number };
  descriptionTruncated: boolean;
}

function cap(text: string, tokens: number, count: (s: string) => number): string {
  return truncateHead(text, tokens, count).text;
}

function renderIntent(intent: Intent): string {
  return [
    `category: ${intent.category}`,
    `intent: ${intent.intent}`,
    `in scope: ${intent.in_scope.join('; ') || 'none'}`,
    `out of scope: ${intent.out_of_scope.join('; ') || 'none'}`,
  ].join('\n');
}

function renderBlast(blast: BlastRadius): string {
  const callers = blast.downstream.flatMap((d) => d.callers.map((c) => `${c.name} (${c.file}:${c.line})`));
  const unique = [...new Set(callers)].slice(0, MAX_BLAST_CALLERS);
  const symbols = blast.changed_symbols.slice(0, MAX_BLAST_CALLERS).map((s) => `${s.name} (${s.file})`);
  return [
    blast.summary,
    symbols.length ? `changed symbols: ${symbols.join(', ')}` : '',
    unique.length ? `callers: ${unique.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Builds the user message and keeps it at or below `maxTokens`. Each section
 * is capped first; if the whole still exceeds the budget it is trimmed in the
 * order specs, least-churn diff files, description tail. Omitted specs/files
 * are counted in the prompt itself.
 */
export function buildBriefPrompt(
  input: BriefPromptInput,
  nonce: string,
  count: (s: string) => number,
  maxTokens: number = MAX_INPUT_TOKENS,
): BriefPrompt {
  const title = input.title.slice(0, MAX_TITLE_CHARS);
  let description = input.description?.trim() ? cap(input.description, MAX_DESCRIPTION_TOKENS, count) : '';
  let descriptionTruncated = description.endsWith(TRUNCATED_MARKER);
  const intent = input.intent ? cap(renderIntent(input.intent), MAX_INTENT_TOKENS, count) : '';
  const issue = input.linkedIssue
    ? cap(
        `#${input.linkedIssue.number} ${input.linkedIssue.title}\n${input.linkedIssue.body ?? ''}`,
        MAX_ISSUE_TOKENS,
        count,
      )
    : '';
  const blast = input.blast ? cap(renderBlast(input.blast), MAX_BLAST_TOKENS, count) : '';

  const sorted = sortByChurn(input.files);
  let fileLines = sorted.slice(0, MAX_DIFF_FILES).map(formatFileStat);
  let omittedFiles = sorted.length - fileLines.length;
  while (fileLines.length > 0 && count(fileLines.join('\n')) > MAX_DIFF_TOKENS) {
    fileLines = fileLines.slice(0, -1);
    omittedFiles += 1;
  }

  let specs: { source: string; text: string }[] = [];
  let omittedSpecs = 0;
  let specTokens = 0;
  for (const s of input.specs) {
    const text = cap(s.text, MAX_SPEC_DOC_TOKENS, count);
    const tokens = count(text);
    if (specTokens + tokens > MAX_SPECS_TOKENS) {
      omittedSpecs += 1;
      continue;
    }
    specTokens += tokens;
    specs.push({ source: s.source, text });
  }

  const render = (): string => {
    const parts: string[] = [`PR #${input.number}`];
    parts.push(wrapUntrusted('title', title, nonce));
    parts.push(
      description
        ? wrapUntrusted('description', description, nonce)
        : 'DESCRIPTION: not provided.',
    );
    parts.push(intent ? `STORED INTENT:\n${wrapUntrusted('intent', intent, nonce)}` : 'STORED INTENT: not available.');
    parts.push(
      issue ? `LINKED ISSUE:\n${wrapUntrusted('linked_issue', issue, nonce)}` : 'LINKED ISSUE: not available.',
    );
    parts.push(
      blast
        ? `BLAST RADIUS (files outside the PR may be cited in risks):\n${wrapUntrusted('blast_radius', blast, nonce)}`
        : 'BLAST RADIUS: not available.',
    );
    parts.push(
      `CHANGED FILES (path · role · +added/-deleted · new-side line ranges):\n${
        fileLines.length ? wrapUntrusted('changed_files', fileLines.join('\n'), nonce) : 'none'
      }` +
        (omittedFiles > 0 ? `\n(${omittedFiles} more changed files omitted)` : ''),
    );
    const specBlocks = specs.map((s) => wrapUntrusted(s.source, s.text, nonce));
    parts.push(
      specs.length || omittedSpecs
        ? `ATTACHED SPECS:\n${specBlocks.join('\n')}` +
            (omittedSpecs > 0 ? `\n(${omittedSpecs} more spec docs omitted)` : '')
        : 'ATTACHED SPECS: none.',
    );
    return parts.join('\n\n');
  };

  let user = render();
  while (count(user) > maxTokens) {
    if (specs.length > 0) {
      specs = specs.slice(0, -1);
      omittedSpecs += 1;
    } else if (fileLines.length > 0) {
      fileLines = fileLines.slice(0, -1);
      omittedFiles += 1;
    } else if (description.length > 0) {
      const body = description.endsWith(TRUNCATED_MARKER)
        ? description.slice(0, -TRUNCATED_MARKER.length)
        : description;
      const half = body.slice(0, Math.floor(body.length / 2)).trimEnd();
      description = half ? `${half}\n${TRUNCATED_MARKER}` : '';
      descriptionTruncated = true;
    } else {
      break;
    }
    user = render();
  }
  return { user, tokens: count(user), omitted: { specs: omittedSpecs, files: omittedFiles }, descriptionTruncated };
}

// -------------------------------------------------------------- validation ---

/** `./x`, `/x`, `\\` separators; `a/` / `b/` diff prefixes only when that makes it an allowed path. */
export function normalisePath(raw: string, allowed: ReadonlySet<string>): string | null {
  const base = raw.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '');
  if (allowed.has(base)) return base;
  const stripped = base.replace(/^[ab]\//, '');
  return stripped !== base && allowed.has(stripped) ? stripped : null;
}

export interface ValidationContext {
  prFiles: ReadonlySet<string>;
  blastFiles: ReadonlySet<string>;
  ranges: ReadonlyMap<string, LineRange[]>;
}

export interface ValidationResult {
  data: PrBriefModelOutput;
  dropped: { risks: number; focus: number; lines: number };
}

/**
 * Risks may cite PR files ∪ blast files (unknown refs are removed; a risk with
 * none left is dropped). Focus items may cite PR files only; a `line` outside
 * every new-side hunk range becomes null.
 */
export function validateBrief(out: PrBriefModelOutput, ctx: ValidationContext): ValidationResult {
  const riskAllowed = new Set([...ctx.prFiles, ...ctx.blastFiles]);
  const risks: PrBriefModelOutput['risks'] = [];
  for (const r of out.risks) {
    const refs = [
      ...new Set(
        r.file_refs.map((f) => normalisePath(f, riskAllowed)).filter((f): f is string => f !== null),
      ),
    ];
    if (refs.length === 0) continue;
    risks.push({ ...r, file_refs: refs });
  }

  let lines = 0;
  const review_focus: PrBriefModelOutput['review_focus'] = [];
  for (const item of out.review_focus) {
    const file = normalisePath(item.file, ctx.prFiles);
    if (!file) continue;
    let line = item.line;
    if (line !== null && !lineInRanges(line, ctx.ranges.get(file) ?? [])) {
      line = null;
      lines += 1;
    }
    review_focus.push({ ...item, file, line });
  }

  return {
    data: { summary: out.summary, risks, review_focus },
    dropped: {
      risks: out.risks.length - risks.length,
      focus: out.review_focus.length - review_focus.length,
      lines,
    },
  };
}
