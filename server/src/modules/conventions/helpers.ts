import type {
  ConventionCandidate,
  ConventionCategory,
  ConventionSkillDraft,
  ConventionStatus,
} from '@devdigest/shared';
import type { ProposedConvention } from './prompt.js';
import {
  DUPLICATE_SIMILARITY,
  MAX_CHARS_PER_FILE,
  MAX_LINES_PER_FILE,
  MIN_SNIPPET_CHARS,
  SKILL_TYPE,
} from './constants.js';

/**
 * Pure core of the conventions extractor: sample rendering, the evidence gate,
 * dedupe, DTO mapping and skill assembly. No I/O — the service does the
 * reading and the writing, this file does the deciding.
 *
 * The row shape is declared STRUCTURALLY rather than imported: the repository
 * imports this file, so importing its row type back would make the pair
 * circular, and `helpers-are-pure` rules out `db/rows.ts` as the alternative
 * (type-only imports count). A `ConventionRow` satisfies it by shape.
 */

export interface ConventionRowLike {
  id: string;
  category: string;
  rule: string;
  rationale: string | null;
  evidencePath: string | null;
  evidenceLine: number | null;
  evidenceSnippet: string | null;
  confidence: number | null;
  status: string;
  createdAt: Date;
}

export interface SampledFile {
  path: string;
  content: string;
}

/** A proposal that survived the gate, with its citation corrected to the file. */
export interface VerifiedCandidate {
  category: ConventionCategory;
  rule: string;
  rationale: string;
  evidencePath: string;
  evidenceLine: number;
  evidenceSnippet: string;
  confidence: number;
}

export interface GateResult {
  kept: VerifiedCandidate[];
  droppedUngrounded: number;
  droppedDuplicate: number;
}

// ---------------------------------------------------------------- sampling

/** Cut a file to the per-file caps. Lines first, so the cut lands cleanly. */
export function truncateFile(content: string): string {
  const lines = content.split('\n').slice(0, MAX_LINES_PER_FILE);
  const text = lines.join('\n');
  return text.length > MAX_CHARS_PER_FILE ? text.slice(0, MAX_CHARS_PER_FILE) : text;
}

/**
 * Render the sample with a 1-based line-number gutter. The gutter is the whole
 * point: without it the model has no line numbers to cite, and a citation
 * nobody can check is the same as no citation.
 */
export function renderSample(files: SampledFile[]): string {
  return files
    .map((f) => {
      const body = f.content
        .split('\n')
        .map((line, i) => `${String(i + 1).padStart(4, ' ')} | ${line}`)
        .join('\n');
      return `===== ${f.path} =====\n${body}`;
    })
    .join('\n\n');
}

// ------------------------------------------------------------ evidence gate

/** Lowercase, collapse all whitespace — how snippets and files are compared. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Strip a leading `./` or `/` so `./src/a.ts` and `src/a.ts` compare equal. */
function trimPathPrefix(p: string): string {
  return p.replace(/^\.?\//, '').trim();
}

/**
 * Map a claimed path onto a path that was actually sampled: exact match, else
 * a UNIQUE suffix match in either direction (the model shortens paths as often
 * as it lengthens them). Ambiguity is left unresolved — guessing between two
 * plausible files is exactly what the gate exists to prevent.
 */
export function resolveSampledPath(claimed: string, sampled: string[]): string | null {
  const c = trimPathPrefix(claimed);
  if (!c) return null;
  const exact = sampled.find((p) => p === c);
  if (exact) return exact;
  const matches = sampled.filter((p) => p.endsWith(`/${c}`) || c.endsWith(`/${p}`));
  return matches.length === 1 ? matches[0]! : null;
}

/** Remove the common leading indentation from a block of lines. */
function dedent(lines: string[]): string {
  const indents = lines
    .filter((l) => l.trim().length > 0)
    .map((l) => l.length - l.trimStart().length);
  const cut = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(cut)).join('\n');
}

/**
 * Find the claimed snippet in the file and return it AS THE FILE HAS IT.
 *
 * Matching ignores whitespace and case, so re-indentation or a wrapped line
 * does not sink a real citation. When a line repeats (a `return null;` in
 * three branches), the occurrence nearest the claimed line wins — that is what
 * a wrong-by-a-few line number almost always means.
 */
export function locateSnippet(
  content: string,
  snippet: string,
  claimedLine: number,
): { line: number; snippet: string } | null {
  const needleLines = snippet.split('\n').filter((l) => l.trim().length > 0);
  if (needleLines.length === 0) return null;
  const needle = normalize(needleLines.join(' '));
  if (needle.replace(/\s/g, '').length < MIN_SNIPPET_CHARS) return null;

  const fileLines = content.split('\n');
  // A model that elides a blank line inside the quote makes the block one or
  // two lines shorter than the file's; widening the window covers that without
  // loosening what has to match.
  for (const window of [needleLines.length, needleLines.length + 2]) {
    const hits: number[] = [];
    for (let start = 0; start + 1 <= fileLines.length; start++) {
      const hay = normalize(fileLines.slice(start, start + window).join(' '));
      if (hay.includes(needle)) hits.push(start + 1);
    }
    if (hits.length === 0) continue;
    const line = hits.reduce((best, h) =>
      Math.abs(h - claimedLine) < Math.abs(best - claimedLine) ? h : best,
    );
    // The widened window can span more lines than the quote needed. Shrink it
    // back to the shortest slice that still contains the match, so the stored
    // evidence is what the model actually cited and not the lines that happened
    // to sit under it — an over-long snippet presents unquoted code as proven.
    let end = line - 1 + window;
    while (end > line && normalize(fileLines.slice(line - 1, end - 1).join(' ')).includes(needle)) {
      end--;
    }
    return { line, snippet: dedent(fileLines.slice(line - 1, end)) };
  }
  return null;
}

/**
 * The gate, in three mechanical checks: the file was sampled, the snippet says
 * something, and the snippet is in that file. A wrong line number is corrected
 * rather than fatal — miscounting a gutter is a formatting slip, inventing code
 * is not.
 */
export function verifyCandidate(
  proposed: ProposedConvention,
  byPath: Map<string, string>,
): VerifiedCandidate | null {
  const path = resolveSampledPath(proposed.evidence_path, [...byPath.keys()]);
  if (!path) return null;
  const content = byPath.get(path);
  if (content === undefined) return null;

  const located = locateSnippet(content, proposed.evidence_snippet, proposed.evidence_line);
  if (!located) return null;

  return {
    category: proposed.category,
    rule: proposed.rule.trim(),
    rationale: proposed.rationale.trim(),
    evidencePath: path,
    evidenceLine: located.line,
    evidenceSnippet: located.snippet,
    confidence: proposed.confidence,
  };
}

// ----------------------------------------------------------------- dedupe

/** Word set of a rule, stripped of punctuation and one-letter noise. */
function words(rule: string): Set<string> {
  return new Set(
    rule
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1),
  );
}

/** Jaccard overlap of two rules' word sets. */
export function ruleSimilarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / (wa.size + wb.size - shared);
}

/**
 * Run every proposal through the gate, strongest first, dropping anything
 * ungrounded and anything that restates a rule already kept — or a rule the
 * user has already decided on, so a re-scan cannot resurrect a rejection.
 */
export function gateCandidates(
  proposed: ProposedConvention[],
  sample: SampledFile[],
  decidedRules: string[],
): GateResult {
  const byPath = new Map(sample.map((f) => [f.path, f.content]));
  const kept: VerifiedCandidate[] = [];
  const seen = [...decidedRules];
  let droppedUngrounded = 0;
  let droppedDuplicate = 0;

  for (const p of [...proposed].sort((a, b) => b.confidence - a.confidence)) {
    const verified = verifyCandidate(p, byPath);
    if (!verified) {
      droppedUngrounded++;
      continue;
    }
    if (seen.some((r) => ruleSimilarity(r, verified.rule) >= DUPLICATE_SIMILARITY)) {
      droppedDuplicate++;
      continue;
    }
    seen.push(verified.rule);
    kept.push(verified);
  }
  return { kept, droppedUngrounded, droppedDuplicate };
}

// -------------------------------------------------------------------- DTO

export function toConventionDto(row: ConventionRowLike): ConventionCandidate {
  return {
    id: row.id,
    category: row.category as ConventionCategory,
    rule: row.rule,
    rationale: row.rationale,
    evidence_path: row.evidencePath ?? '',
    evidence_line: row.evidenceLine,
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    status: row.status as ConventionStatus,
    created_at: row.createdAt.toISOString(),
  };
}

// ------------------------------------------------------------ skill assembly

/** `Use async/await instead of .then()` → `use-async-await-instead-of-then`. */
export function slugify(rule: string): string {
  return (
    rule
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .split('-')
      .slice(0, 6)
      .join('-') || 'convention'
  );
}

/**
 * Merge the accepted candidates into one skill body. Every rule keeps its
 * citation, because the skill is only as trustworthy as the evidence a reader
 * can go and check — and because a reviewing agent quoting `file:line` back at
 * an author is the whole point of extracting these.
 */
/**
 * True when the rationale only echoes the rule back. Models routinely fill
 * this field by restating the rule, and a skill body that says every rule
 * twice wastes prompt budget and reads as broken to whoever opens it.
 */
export function isEchoOfRule(rule: string, rationale: string | null | undefined): boolean {
  if (!rationale) return true;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return norm(rationale) === norm(rule);
}

export function buildSkillDraft(
  repoName: string,
  accepted: ConventionCandidate[],
): ConventionSkillDraft {
  const name = `${repoName}-conventions`;
  const sections = accepted.map((c) => {
    const where = c.evidence_line ? `${c.evidence_path}:${c.evidence_line}` : c.evidence_path;
    const rationale = isEchoOfRule(c.rule, c.rationale) ? '' : `\n${c.rationale}\n`;
    return `## ${slugify(c.rule)}
${c.rule}
${rationale}
Detected in \`${where}\`:

\`\`\`
${c.evidence_snippet}
\`\`\``;
  });

  const body = `# ${name}

House conventions for \`${repoName}\`. Flag changes that violate any rule below
and cite the offending \`file:line\`. A rule that the diff does not touch is not
a finding.

${sections.join('\n\n')}`;

  return {
    name,
    description: `${accepted.length} house convention${
      accepted.length === 1 ? '' : 's'
    } extracted from ${repoName}`,
    type: SKILL_TYPE,
    body,
    evidence_files: [...new Set(accepted.map((c) => c.evidence_path))],
    convention_ids: accepted.map((c) => c.id),
  };
}
