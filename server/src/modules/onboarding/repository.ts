import { and, eq, gte, sql } from 'drizzle-orm';
import type { OnboardingTour } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * onboarding data-access. Owns the `onboarding` table; reads `repos`
 * (workspace scoping), `pull_requests` + `pr_files` (hotness). Row shapes are declared structurally so helpers never import them.
 */

export interface RepoRefRow {
  id: string;
  owner: string;
  name: string;
  fullName: string;
}

export interface StoredTourRow {
  json: unknown;
  generatedAt: Date;
  generatedSha: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  llmCalls: number | null;
  durationMs: number | null;
}

export interface TourUsage {
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  llmCalls: number;
  durationMs: number;
}

export class OnboardingRepository {
  constructor(private db: Db) {}

  async getRepoInWorkspace(workspaceId: string, repoId: string): Promise<RepoRefRow | null> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name, fullName: t.repos.fullName })
      .from(t.repos)
      .where(and(eq(t.repos.id, repoId), eq(t.repos.workspaceId, workspaceId)));
    return row ?? null;
  }

  async getStored(repoId: string): Promise<StoredTourRow | null> {
    const [row] = await this.db
      .select({
        json: t.onboarding.json,
        generatedAt: t.onboarding.generatedAt,
        generatedSha: t.onboarding.generatedSha,
        model: t.onboarding.model,
        tokensIn: t.onboarding.tokensIn,
        tokensOut: t.onboarding.tokensOut,
        costUsd: t.onboarding.costUsd,
        llmCalls: t.onboarding.llmCalls,
        durationMs: t.onboarding.durationMs,
      })
      .from(t.onboarding)
      .where(eq(t.onboarding.repoId, repoId));
    return row ?? null;
  }

  /** Distinct PRs touching each path, over PRs opened since `since`. */
  async getPrTouches(repoId: string, since: Date): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        path: t.prFiles.path,
        touches: sql<number>`count(distinct ${t.prFiles.prId})::int`,
      })
      .from(t.prFiles)
      .innerJoin(t.pullRequests, eq(t.prFiles.prId, t.pullRequests.id))
      .where(and(eq(t.pullRequests.repoId, repoId), gte(t.pullRequests.openedAt, since)))
      .groupBy(t.prFiles.path);
    return new Map(rows.map((r) => [r.path, r.touches]));
  }

  /**
   * Upsert tour + usage. The repo row is share-locked in the same transaction
   * so a concurrent delete cannot slip between the check and the write;
   * returns false (writes nothing) when the repo is gone.
   */
  async upsertTour(
    repoId: string,
    tour: OnboardingTour,
    usage: TourUsage,
    generatedSha: string | null,
    now: Date,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [repo] = await tx
        .select({ id: t.repos.id })
        .from(t.repos)
        .where(eq(t.repos.id, repoId))
        .for('share');
      if (!repo) return false;
      const values = {
        json: tour,
        generatedAt: now,
        generatedSha,
        model: usage.model,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        costUsd: usage.costUsd,
        llmCalls: usage.llmCalls,
        durationMs: usage.durationMs,
      };
      await tx
        .insert(t.onboarding)
        .values({ repoId, ...values })
        .onConflictDoUpdate({ target: t.onboarding.repoId, set: values });
      return true;
    });
  }
}
