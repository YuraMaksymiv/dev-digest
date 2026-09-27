import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionCategory, ConventionStatus } from '@devdigest/shared';

/**
 * Conventions data-access. Owns the `conventions` table. Reads (never writes)
 * `repos` for the owner/name/clone tuple a scan needs — the same one-way read
 * `SkillsRepository` does against `agents`, and cheaper than routing a single
 * lookup through another module's data layer. Workspace-scoped throughout.
 */

import type { ConventionRow } from '../../db/rows.js';
export type { ConventionRow };

export interface InsertConvention {
  category: ConventionCategory;
  rule: string;
  rationale: string;
  evidencePath: string;
  evidenceLine: number;
  evidenceSnippet: string;
  confidence: number;
}

export interface UpdateConvention {
  rule?: string;
  rationale?: string;
  status?: ConventionStatus;
}

/** What a scan needs to know about the repo it is scanning. */
export interface RepoRefRow {
  owner: string;
  name: string;
  fullName: string;
  clonePath: string | null;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  async getRepoRef(workspaceId: string, repoId: string): Promise<RepoRefRow | undefined> {
    const [row] = await this.db
      .select({
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)))
      .limit(1);
    return row;
  }

  /** Strongest first — the triage list is read top-down and acted on in order. */
  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence), desc(t.conventions.createdAt));
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .limit(1);
    return row;
  }

  /**
   * Swap in a fresh scan's results. ONLY `pending` rows are replaced: a rule
   * the user accepted stays accepted, and one they rejected stays rejected
   * instead of being proposed again by the next scan.
   *
   * Wrapped in a transaction so a failed insert cannot leave the repo with the
   * old pending rows deleted and no new ones.
   */
  async replacePending(
    workspaceId: string,
    repoId: string,
    rows: InsertConvention[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, repoId),
            eq(t.conventions.status, 'pending'),
          ),
        );
      if (rows.length === 0) return;
      await tx
        .insert(t.conventions)
        .values(rows.map((r) => ({ ...r, workspaceId, repoId, status: 'pending' as const })));
    });
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConvention,
  ): Promise<ConventionRow | undefined> {
    if (Object.keys(patch).length === 0) return this.getById(workspaceId, id);
    const [row] = await this.db
      .update(t.conventions)
      .set(patch)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  async remove(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning({ id: t.conventions.id });
    return rows.length > 0;
  }
}
