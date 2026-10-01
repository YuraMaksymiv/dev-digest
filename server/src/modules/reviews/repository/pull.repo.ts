import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { Intent, PrRef } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

/**
 * Resolve a PR from `owner/name` + number within the workspace. `repo_missing`
 * vs `pr_missing` lets the caller say which import is absent.
 */
export async function findPullByRepoAndNumber(
  db: Db,
  workspaceId: string,
  fullName: string,
  number: number,
): Promise<{ found: PrRef } | { missing: 'repo' | 'pr' }> {
  const [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, fullName)));
  if (!repo) return { missing: 'repo' };
  const [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(
      and(
        eq(t.pullRequests.workspaceId, workspaceId),
        eq(t.pullRequests.repoId, repo.id),
        eq(t.pullRequests.number, number),
      ),
    );
  if (!pr) return { missing: 'pr' };
  return {
    found: {
      pr_id: pr.id,
      repo_id: repo.id,
      repo: repo.fullName,
      number: pr.number,
      title: pr.title,
      status: pr.status,
      head_sha: pr.headSha,
    },
  };
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

export async function getPrCommits(
  db: Db,
  prId: string,
): Promise<(typeof t.prCommits.$inferSelect)[]> {
  return db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent ---------------------------------------------------------------

export async function upsertIntent(db: Db, prId: string, intent: Intent): Promise<void> {
  const values = {
    prId,
    intent: intent.intent,
    inScope: intent.in_scope,
    outOfScope: intent.out_of_scope,
    confidence: intent.confidence,
    category: intent.category,
    sources: intent.sources ?? null,
  };
  await db
    .insert(t.prIntent)
    .values(values)
    .onConflictDoUpdate({
      target: t.prIntent.prId,
      set: {
        intent: values.intent,
        inScope: values.inScope,
        outOfScope: values.outOfScope,
        confidence: values.confidence,
        category: values.category,
        sources: values.sources,
      },
    });
}

export async function getIntent(db: Db, prId: string): Promise<Intent | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  return {
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    confidence: row.confidence,
    category: row.category as Intent['category'],
    sources: row.sources ?? null,
  };
}
