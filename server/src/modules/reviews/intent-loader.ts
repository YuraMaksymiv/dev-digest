import type { Container } from '../../platform/container.js';
import type { Intent, IntentSourceState, IntentSources, UnifiedDiff } from '@devdigest/shared';
import { Intent as IntentSchema } from '@devdigest/shared';
import type { ReviewRepository, PullRow, RepoRow } from './repository.js';
import type { RunLogger } from '../../platform/run-logger.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { INTENT_SCHEMA_NAME, SYSTEM_PROMPT, buildUserPrompt } from './intent-prompt.js';

/** A non-issue URL in the PR body — best-effort candidate for a linked spec. */
const URL_RE = /https?:\/\/[^\s)]+/i;

/**
 * Derive a PR's intent/scope — enrichment, not a gate. Gathers already-
 * available signals (title/body/branch/touched files), the PR's commit
 * messages (DB), and best-effort resolves a linked GitHub issue / generic
 * spec URL, then runs ONE structured-output classification call.
 *
 * NEVER throws: every internal failure is caught, logged via `runLog`, and
 * resolves to `undefined` — the caller (`run-executor.ts`) treats a missing
 * intent exactly like a missing PR description (the prompt section is
 * omitted), unlike diff loading, which legitimately fails the run.
 */
export async function loadIntent(
  container: Container,
  repo: ReviewRepository,
  workspaceId: string,
  pull: PullRow,
  repoRow: RepoRow,
  diff: UnifiedDiff,
  runLog: RunLogger,
): Promise<Intent | undefined> {
  const start = Date.now();
  let runId: string | undefined;
  try {
    const files = diff.files.map((f) => ({
      path: f.path,
      hunkHeaders: f.hunks.map((h) => h.header).filter(Boolean).slice(0, 15),
    }));

    const commits = await repo.getPrCommits(pull.id).catch(() => []);
    const commitMessages = commits.map((c) => c.message);

    const linkedIssue = await resolveLinkedIssueSignal(container, repoRow, pull);
    const linkedContent = await resolveLinkedContentSignal(container, pull);

    // Server-known fetch state — the model is never asked about this; it can't
    // know whether a fetch succeeded, only the server does.
    const sources: IntentSources = {
      linked_issue: linkedIssue.state,
      linked_content: linkedContent.state,
    };
    const missingContext: string[] = [];
    if (linkedIssue.state === 'unavailable') {
      missingContext.push('A linked issue reference was found but the issue could not be fetched.');
    }
    if (linkedContent.state === 'unavailable') {
      missingContext.push('A linked URL was found in the PR body but its content could not be fetched.');
    }

    const choice = await resolveFeatureModel(container, workspaceId, 'review_intent');
    const llm = await container.llm(choice.provider);

    runId = await repo.createAgentRun({
      workspaceId,
      agentId: null,
      prId: pull.id,
      provider: choice.provider,
      model: choice.model,
    });

    const res = await llm.completeStructured<Omit<Intent, 'sources'>>({
      model: choice.model,
      schema: IntentSchema.omit({ sources: true }),
      schemaName: INTENT_SCHEMA_NAME,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildUserPrompt({
            title: pull.title,
            description: pull.body,
            branch: pull.branch,
            files,
            commitMessages,
            linkedIssue: linkedIssue.state === 'fetched' ? linkedIssue.issue : undefined,
            linkedContent: linkedContent.state === 'fetched' ? linkedContent.content : undefined,
            missingContext,
          }),
        },
      ],
    });

    // Merge the server-computed `sources` in AFTER the call — never part of the
    // LLM-facing schema (decision A0.1).
    const intent: Intent = { ...res.data, sources };
    await repo.upsertIntent(pull.id, intent);

    await repo.completeAgentRun(runId, {
      status: 'done',
      durationMs: Date.now() - start,
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      // Review-specific fields with no real meaning for a classifier call.
      findingsCount: 0,
      grounding: 'n/a',
      costUsd: res.costUsd,
      error: null,
    });

    runLog.info(
      `intent: derived (${choice.provider}/${choice.model}) — category=${intent.category}, confidence=${intent.confidence.toFixed(2)}`,
    );
    return intent;
  } catch (err) {
    const msg = (err as Error).message;
    runLog.info(`intent: skipped — ${msg}`);
    if (runId) {
      await repo
        .completeAgentRun(runId, {
          status: 'failed',
          durationMs: Date.now() - start,
          tokensIn: 0,
          tokensOut: 0,
          findingsCount: 0,
          grounding: 'n/a',
          error: msg,
        })
        .catch(() => undefined);
    }
    return undefined;
  }
}

/**
 * Best-effort linked-issue resolution via the generalized body/title/branch
 * regex. Distinguishes "nothing was linked" (`absent`) from "a reference was
 * found but couldn't be fetched" (`unavailable`) — `null`/`undefined` alone
 * couldn't tell those apart.
 */
export async function resolveLinkedIssueSignal(
  container: Container,
  repoRow: RepoRow,
  pull: PullRow,
): Promise<
  | { state: Extract<IntentSourceState, 'fetched'>; issue: { number: number; title: string; body: string | null } }
  | { state: Extract<IntentSourceState, 'unavailable' | 'absent'> }
> {
  const text = [pull.body ?? '', pull.title, pull.branch].join('\n');
  const m = text.match(/(?:closes|fixes|resolves)?\s*#(\d+)/i);
  if (!m?.[1]) return { state: 'absent' };
  try {
    const client = await container.github();
    const issue = await client.getIssue({ owner: repoRow.owner, name: repoRow.name }, Number(m[1]));
    return { state: 'fetched', issue: { number: issue.number, title: issue.title, body: issue.body ?? null } };
  } catch {
    return { state: 'unavailable' };
  }
}

/**
 * Best-effort generic URL fetch for a non-issue link found in the PR body.
 * Same three-state contract as `resolveLinkedIssueSignal`.
 */
export async function resolveLinkedContentSignal(
  container: Container,
  pull: PullRow,
): Promise<
  | { state: Extract<IntentSourceState, 'fetched'>; content: string }
  | { state: Extract<IntentSourceState, 'unavailable' | 'absent'> }
> {
  const url = pull.body?.match(URL_RE)?.[0];
  if (!url) return { state: 'absent' };
  try {
    const content = await container.linkFetch(url);
    if (content === undefined) return { state: 'unavailable' };
    return { state: 'fetched', content };
  } catch {
    return { state: 'unavailable' };
  }
}
