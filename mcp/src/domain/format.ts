import { MAX_OUTPUT_CHARS, RUN_SUMMARY_FINDINGS, SEVERITY_RANK } from './constants.js';
import { encodeCursor, type CursorScope } from './cursor.js';
import { UNTRUSTED_OVERHEAD, wrapUntrusted } from './untrusted.js';
import type {
  AgentInfo,
  Convention,
  Finding,
  PrRef,
  ResponseFormat,
  Review,
  RunDetail,
  Severity,
} from './types.js';

export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.file.localeCompare(b.file) ||
      a.startLine - b.startLine ||
      a.id.localeCompare(b.id),
  );
}

export function countBySeverity(findings: readonly Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

function countsLabel(findings: readonly Finding[]): string {
  const c = countBySeverity(findings);
  return `${findings.length} findings (${c.CRITICAL} critical, ${c.WARNING} warning, ${c.SUGGESTION} suggestion)`;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function location(f: Finding): string {
  return f.startLine === f.endLine ? `${f.file}:${f.startLine}` : `${f.file}:${f.startLine}-${f.endLine}`;
}

export function formatFindingLine(f: Finding, format: ResponseFormat): string {
  const head = `[${f.severity}] ${location(f)} ${oneLine(f.title)}`;
  if (format === 'concise') return head;
  const parts = [head, `  why: ${oneLine(f.rationale)}`];
  if (f.suggestion) parts.push(`  fix: ${oneLine(f.suggestion)}`);
  return parts.join('\n');
}

export function formatAgents(agents: readonly AgentInfo[]): string {
  if (agents.length === 0) return 'No agents configured in DevDigest. Create one in the DevDigest UI first.';
  const lines = agents.map((a) => {
    const focus = oneLine(a.description).slice(0, 100);
    return `- ${a.name} (id: ${a.id}) ${a.enabled ? 'enabled' : 'disabled'} - ${focus}`;
  });
  return lines.join('\n');
}

function runHeader(run: RunDetail): string {
  const who = run.agentName ?? 'agent';
  return `run_id=${run.runId} agent=${who} pr=${run.repo}#${run.prNumber}`;
}

export function formatRunning(run: RunDetail, hint: string): string {
  return `${runHeader(run)} status=running. ${hint}`;
}

export function formatRunFailed(run: RunDetail): string {
  const reason = run.error ? wrapUntrusted(oneLine(run.error).slice(0, 1000)) : 'no reason recorded';
  return `${runHeader(run)} status=failed. Reason:\n${reason}\nCheck the run in the DevDigest UI (agent model/provider settings), then run_agent_on_pr again.`;
}

export function formatRunCancelled(run: RunDetail): string {
  return `${runHeader(run)} status=cancelled. The run was cancelled in DevDigest; call run_agent_on_pr to start a new one.`;
}

function reviewHeadline(run: RunDetail, review: Review | undefined, findings: readonly Finding[]): string {
  const bits = [`${runHeader(run)} status=done`];
  if (review?.verdict) bits.push(`verdict=${review.verdict}`);
  const score = review?.score ?? run.score;
  if (score !== null && score !== undefined) bits.push(`score=${score}`);
  return `${bits.join(' ')}: ${countsLabel(findings)}`;
}

/** Concise completion summary returned by run_agent_on_pr: top findings only. */
export function formatRunSummary(run: RunDetail, review: Review | undefined): string {
  const findings = sortFindings(review?.findings ?? []);
  const head = reviewHeadline(run, review, findings);
  const body: string[] = [];
  const summary = review?.summary ? oneLine(review.summary) : '';
  if (summary) body.push(`summary: ${summary.slice(0, 400)}`);
  for (const f of findings.slice(0, RUN_SUMMARY_FINDINGS)) body.push(formatFindingLine(f, 'concise'));

  let footer = '';
  if (findings.length > RUN_SUMMARY_FINDINGS) {
    footer = `... ${findings.length - RUN_SUMMARY_FINDINGS} more. Call get_findings(run_id="${run.runId}") for all, with response_format=detailed for rationale and fixes.`;
  } else if (findings.length > 0) {
    footer = `For rationale and fixes call get_findings(run_id="${run.runId}", response_format="detailed").`;
  }
  const outside = [head, footer].filter(Boolean);
  if (body.length === 0) return outside.join('\n');
  const budget = MAX_OUTPUT_CHARS - head.length - footer.length - 2;
  return [head, wrapUntrusted(body.join('\n'), budget), footer].filter(Boolean).join('\n');
}

export interface FindingsPageInput {
  run: RunDetail;
  review: Review | undefined;
  sorted: readonly Finding[];
  offset: number;
  limit: number;
  format: ResponseFormat;
  scope: CursorScope;
}

/**
 * One page of findings. The page is cut short when it would exceed the output
 * budget; the next cursor then resumes right after the last finding shown, so
 * nothing is skipped.
 */
export function formatFindingsPage(input: FindingsPageInput): string {
  const { run, review, sorted, offset, limit, format, scope } = input;
  const header = reviewHeadline(run, review, review?.findings ?? []);
  const total = sorted.length;
  const filter = scope.severity ? ` (filtered to ${scope.severity}: ${total})` : '';
  if (total === 0) return `${header}${filter}\nNo findings to show.`;
  if (offset >= total) return `${header}${filter}\nNo more findings (offset ${offset} is past the end of ${total}).`;

  const lines: string[] = [];
  const footerReserve = 200;
  let used = header.length + filter.length + footerReserve + UNTRUSTED_OVERHEAD;
  let shown = 0;
  for (const f of sorted.slice(offset, offset + limit)) {
    const line = formatFindingLine(f, format);
    if (shown > 0 && used + line.length + 1 > MAX_OUTPUT_CHARS) break;
    lines.push(line);
    used += line.length + 1;
    shown += 1;
  }
  const end = offset + shown;
  const footer =
    end < total
      ? `Showing ${offset + 1}-${end} of ${total}. More: call get_findings again with cursor="${encodeCursor(scope, end)}".`
      : `Showing ${offset + 1}-${end} of ${total}. End of results.`;
  const budget = MAX_OUTPUT_CHARS - header.length - filter.length - footer.length - 2;
  return [`${header}${filter}`, wrapUntrusted(lines.join('\n'), budget), footer].join('\n');
}

/** Latest review per agent: a rerun of the same agent supersedes its older reviews. */
export function latestReviewPerAgent(reviews: readonly Review[]): Review[] {
  const newestFirst = reviews
    .filter((r) => r.kind === 'review')
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  const seen = new Set<string>();
  return newestFirst.filter((r, i) => {
    const key = r.agentName ?? r.runId ?? `#${i}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findingJson(f: Finding, format: ResponseFormat) {
  const base = { severity: f.severity, location: location(f), title: oneLine(f.title) };
  if (format === 'concise') return base;
  return { ...base, rationale: oneLine(f.rationale), suggestion: f.suggestion ? oneLine(f.suggestion) : null };
}

export interface PrFindingsInput {
  pr: PrRef;
  reviews: readonly Review[];
  severity: Severity | undefined;
  format: ResponseFormat;
  limit: number;
}

/**
 * Whole-PR view: every agent's latest review with its findings nested. When the
 * JSON would exceed the output budget, the per-review cap shrinks evenly
 * instead of dropping whole agents; findings_count always reports the full number.
 */
export function formatPrFindings(input: PrFindingsInput): string {
  const { pr, severity, format, limit } = input;
  const prLabel = `${pr.repo}#${pr.number}`;
  const reviews = latestReviewPerAgent(input.reviews).map((review) => ({
    review,
    sorted: sortFindings(severity ? review.findings.filter((f) => f.severity === severity) : review.findings),
  }));
  if (reviews.length === 0) {
    return `${prLabel}: no reviews yet. Start one with run_agent_on_pr(repo="${pr.repo}", pr_number=${pr.number}).`;
  }

  const total = reviews.reduce((n, r) => n + r.sorted.length, 0);
  const filter = severity ? ` (filtered to ${severity})` : '';
  const header = `${prLabel}: ${reviews.length} review(s), total_findings=${total}${filter}.`;
  const build = (perReview: number) =>
    JSON.stringify({
      repo: pr.repo,
      pr_number: pr.number,
      total_findings: total,
      reviews: reviews.map(({ review, sorted }) => ({
        agent: review.agentName,
        run_id: review.runId,
        verdict: review.verdict,
        score: review.score,
        findings_count: sorted.length,
        findings: sorted.slice(0, perReview).map((f) => findingJson(f, format)),
      })),
    });

  const footerReserve = 200;
  const room = MAX_OUTPUT_CHARS - header.length - footerReserve - UNTRUSTED_OVERHEAD;
  let perReview = limit;
  let json = build(perReview);
  while (json.length > room && perReview > 0) {
    perReview -= 1;
    json = build(perReview);
  }

  const truncated = reviews.some((r) => r.sorted.length > perReview);
  const footer = truncated
    ? `Showing up to ${perReview} findings per review. For one agent's full list call get_findings(run_id=<that review's run_id>), which paginates.`
    : '';
  const budget = MAX_OUTPUT_CHARS - header.length - footer.length - 2;
  return [header, wrapUntrusted(json, budget), footer].filter(Boolean).join('\n');
}

export function formatConventions(conventions: readonly Convention[], section: string | undefined): string {
  const scope = section ? ` in section "${section}"` : '';
  if (conventions.length === 0) {
    return `No accepted conventions${scope}. Conventions appear after they are extracted and accepted in the DevDigest UI.`;
  }
  const sorted = [...conventions].sort(
    (a, b) => a.category.localeCompare(b.category) || b.confidence - a.confidence || a.rule.localeCompare(b.rule),
  );
  const lines: string[] = [];
  let used = 0;
  for (const c of sorted) {
    const line = `- [${c.category}] ${oneLine(c.rule)}`;
    if (used + line.length + 1 > MAX_OUTPUT_CHARS - 120) {
      lines.push(`... ${sorted.length - lines.length} more rules omitted; pass \`section\` to narrow.`);
      break;
    }
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join('\n');
}
