import type { Container } from '../../platform/container.js';
import type { Intent, UnifiedDiff } from '@devdigest/shared';
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
    const filePaths = diff.files.map((f) => f.path);

    const commits = await repo.getPrCommits(pull.id).catch(() => []);
    const commitMessages = commits.map((c) => c.message);

    const linkedIssue = await resolveLinkedIssueSignal(container, repoRow, pull);
    const linkedContent = await resolveLinkedContentSignal(container, pull);

    const choice = await resolveFeatureModel(container, workspaceId, 'review_intent');
    const llm = await container.llm(choice.provider);

    runId = await repo.createAgentRun({
      workspaceId,
      agentId: null,
      prId: pull.id,
      provider: choice.provider,
      model: choice.model,
    });

    const res = await llm.completeStructured<Intent>({
      model: choice.model,
      schema: IntentSchema,
      schemaName: INTENT_SCHEMA_NAME,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildUserPrompt({
            title: pull.title,
            description: pull.body,
            branch: pull.branch,
            filePaths,
            commitMessages,
            linkedIssue,
            linkedContent,
          }),
        },
      ],
    });

    await repo.upsertIntent(pull.id, res.data);

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
      `intent: derived (${choice.provider}/${choice.model}) — category=${res.data.category}, confidence=${res.data.confidence.toFixed(2)}`,
    );
    return res.data;
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

/** Best-effort linked-issue resolution via the generalized body/title/branch regex. */
async function resolveLinkedIssueSignal(
  container: Container,
  repoRow: RepoRow,
  pull: PullRow,
): Promise<{ number: number; title: string; body: string | null } | null> {
  try {
    const text = [pull.body ?? '', pull.title, pull.branch].join('\n');
    const m = text.match(/(?:closes|fixes|resolves)?\s*#(\d+)/i);
    if (!m?.[1]) return null;
    const client = await container.github();
    const issue = await client.getIssue({ owner: repoRow.owner, name: repoRow.name }, Number(m[1]));
    return { number: issue.number, title: issue.title, body: issue.body ?? null };
  } catch {
    return null;
  }
}

/** Best-effort generic URL fetch for a non-issue link found in the PR body. */
async function resolveLinkedContentSignal(
  container: Container,
  pull: PullRow,
): Promise<string | undefined> {
  try {
    const url = pull.body?.match(URL_RE)?.[0];
    if (!url) return undefined;
    return await container.linkFetch(url);
  } catch {
    return undefined;
  }
}
