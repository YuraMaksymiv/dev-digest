import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * project-context data-access. Owns `agent_context_docs` and
 * `skill_context_docs`; reads `repos`, `agents`, `skills` and `agent_skills`
 * for workspace scoping (the attachment tables carry no workspace_id) and the
 * `used_by` aggregate.
 */

export type OwnerKind = 'agent' | 'skill';

export interface RepoRefRow {
  id: string;
  owner: string;
  name: string;
}

export interface AttachmentRow {
  path: string;
  position: number;
}

export class ProjectContextRepository {
  constructor(private db: Db) {}

  async getRepoInWorkspace(workspaceId: string, repoId: string): Promise<RepoRefRow | null> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.id, repoId), eq(t.repos.workspaceId, workspaceId)));
    return row ?? null;
  }

  /** Run-time lookup (the executor already authorised the run). */
  async getRepoRef(repoId: string): Promise<RepoRefRow | null> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(eq(t.repos.id, repoId));
    return row ?? null;
  }

  async ownerExists(workspaceId: string, kind: OwnerKind, ownerId: string): Promise<boolean> {
    if (kind === 'agent') {
      const [row] = await this.db
        .select({ id: t.agents.id })
        .from(t.agents)
        .where(and(eq(t.agents.id, ownerId), eq(t.agents.workspaceId, workspaceId)));
      return !!row;
    }
    const [row] = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.id, ownerId), eq(t.skills.workspaceId, workspaceId)));
    return !!row;
  }

  async getAttachments(kind: OwnerKind, ownerId: string, repoId: string): Promise<AttachmentRow[]> {
    if (kind === 'agent') {
      return this.db
        .select({ path: t.agentContextDocs.path, position: t.agentContextDocs.position })
        .from(t.agentContextDocs)
        .where(and(eq(t.agentContextDocs.agentId, ownerId), eq(t.agentContextDocs.repoId, repoId)))
        .orderBy(asc(t.agentContextDocs.position));
    }
    return this.db
      .select({ path: t.skillContextDocs.path, position: t.skillContextDocs.position })
      .from(t.skillContextDocs)
      .where(and(eq(t.skillContextDocs.skillId, ownerId), eq(t.skillContextDocs.repoId, repoId)))
      .orderBy(asc(t.skillContextDocs.position));
  }

  /** Attachments of several skills for one repo, grouped by skill id. */
  async getSkillAttachments(
    skillIds: string[],
    repoId: string,
  ): Promise<Map<string, AttachmentRow[]>> {
    const out = new Map<string, AttachmentRow[]>();
    if (skillIds.length === 0) return out;
    const rows = await this.db
      .select({
        skillId: t.skillContextDocs.skillId,
        path: t.skillContextDocs.path,
        position: t.skillContextDocs.position,
      })
      .from(t.skillContextDocs)
      .where(and(inArray(t.skillContextDocs.skillId, skillIds), eq(t.skillContextDocs.repoId, repoId)))
      .orderBy(asc(t.skillContextDocs.position));
    for (const r of rows) {
      const list = out.get(r.skillId) ?? [];
      list.push({ path: r.path, position: r.position });
      out.set(r.skillId, list);
    }
    return out;
  }

  /** Replaces the owner+repo attachment set atomically; `paths` order = position. */
  async replaceAttachments(
    kind: OwnerKind,
    ownerId: string,
    repoId: string,
    paths: string[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (kind === 'agent') {
        await tx
          .delete(t.agentContextDocs)
          .where(and(eq(t.agentContextDocs.agentId, ownerId), eq(t.agentContextDocs.repoId, repoId)));
        if (paths.length === 0) return;
        await tx
          .insert(t.agentContextDocs)
          .values(paths.map((path, position) => ({ agentId: ownerId, repoId, path, position })));
        return;
      }
      await tx
        .delete(t.skillContextDocs)
        .where(and(eq(t.skillContextDocs.skillId, ownerId), eq(t.skillContextDocs.repoId, repoId)));
      if (paths.length === 0) return;
      await tx
        .insert(t.skillContextDocs)
        .values(paths.map((path, position) => ({ skillId: ownerId, repoId, path, position })));
    });
  }

  /**
   * Distinct agents per doc path for a repo: attached directly, or linked
   * (any `agent_skills` row) to a skill that has it attached.
   */
  async usedByCounts(repoId: string): Promise<Map<string, number>> {
    const [direct, viaSkill] = await Promise.all([
      this.db
        .select({ agentId: t.agentContextDocs.agentId, path: t.agentContextDocs.path })
        .from(t.agentContextDocs)
        .where(eq(t.agentContextDocs.repoId, repoId)),
      this.db
        .select({ agentId: t.agentSkills.agentId, path: t.skillContextDocs.path })
        .from(t.skillContextDocs)
        .innerJoin(t.agentSkills, eq(t.agentSkills.skillId, t.skillContextDocs.skillId))
        .where(eq(t.skillContextDocs.repoId, repoId)),
    ]);
    const byPath = new Map<string, Set<string>>();
    for (const r of [...direct, ...viaSkill]) {
      const set = byPath.get(r.path) ?? new Set<string>();
      set.add(r.agentId);
      byPath.set(r.path, set);
    }
    return new Map([...byPath].map(([path, agents]) => [path, agents.size]));
  }
}
