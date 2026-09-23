import { and, asc, count, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillType, SkillSource } from '@devdigest/shared';
import { DEFAULT_SKILL_SOURCE, INITIAL_SKILL_VERSION } from './constants.js';
import { isSkillConfigChange } from './helpers.js';

/**
 * Skills data-access. Owns `skills` and `skill_versions`. Reads (never writes)
 * `agent_skills` + `agents` for the reverse "which agents use this skill"
 * lookup — the agents module owns the write side of that link table, exactly as
 * `AgentsRepository` reads `skills` for its own join. Workspace-scoped
 * throughout.
 */

import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
export type { SkillRow, SkillVersionRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

/** A skill plus how many agents link it — the list rail's row. */
export interface SkillWithUsage {
  skill: SkillRow;
  usedBy: number;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  /**
   * All skills in the workspace with their link count, newest first. One
   * left-join + group-by rather than a count query per row.
   */
  async listWithUsage(workspaceId: string): Promise<SkillWithUsage[]> {
    const rows = await this.db
      .select({ skill: t.skills, usedBy: count(t.agentSkills.agentId) })
      .from(t.skills)
      .leftJoin(t.agentSkills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.skills.workspaceId, workspaceId))
      .groupBy(t.skills.id)
      .orderBy(desc(t.skills.createdAt));
    return rows.map((r) => ({ skill: r.skill, usedBy: r.usedBy }));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  async insert(values: InsertSkill): Promise<SkillRow> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description,
        type: values.type,
        source: values.source ?? DEFAULT_SKILL_SOURCE,
        body: values.body,
        enabled: values.enabled ?? true,
        version: INITIAL_SKILL_VERSION,
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_SKILL_VERSION);
    return row!;
  }

  /**
   * Patch a skill. A CONTENT change (name/description/type/body) bumps the
   * version and appends a `skill_versions` snapshot; toggling `enabled` alone
   * does neither. Returns undefined when the id is not in this workspace.
   */
  async update(workspaceId: string, id: string, patch: UpdateSkill): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const contentChanged = isSkillConfigChange(existing, patch);
    const nextVersion = contentChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.skills)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(contentChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();

    if (contentChanged && row) await this.snapshotVersion(row, nextVersion);
    return row;
  }

  /** Delete a skill (scoped to workspace). Versions and agent links cascade. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** All body snapshots for a skill, newest version first. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }

  /** Agents linking this skill — shown before a delete, and as "used by". */
  async linkedAgents(skillId: string): Promise<Array<{ id: string; name: string }>> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(eq(t.agentSkills.skillId, skillId))
      .orderBy(asc(t.agents.name));
  }

  /**
   * Append an immutable body snapshot. `onConflictDoNothing` because the
   * version bump is a read-modify-write with no lock (as elsewhere in this
   * server): a concurrent second write drops its snapshot rather than failing.
   */
  private async snapshotVersion(row: SkillRow, version: number): Promise<void> {
    await this.db
      .insert(t.skillVersions)
      .values({ skillId: row.id, version, body: row.body })
      .onConflictDoNothing();
  }
}
