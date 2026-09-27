import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping and the
 * content-version-bump rule. No I/O.
 *
 * The row shapes below are declared STRUCTURALLY rather than imported: the
 * repository imports this file, so importing its row types back would make the
 * pair circular, and `helpers-are-pure` rules out reaching for `db/rows.ts`
 * instead (type-only imports count — `tsPreCompilationDeps` is on). A `SkillRow`
 * satisfies these by shape, so callers pass rows unchanged.
 */

export interface SkillRowLike {
  id: string;
  name: string;
  description: string;
  type: string;
  source: string;
  body: string;
  enabled: boolean;
  version: number;
  evidenceFiles: string[] | null;
}

export interface SkillVersionRowLike {
  skillId: string;
  version: number;
  body: string;
  createdAt: Date;
}

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRowLike): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/** Map a persisted `skill_versions` row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRowLike): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

/** Fields whose change bumps the skill's version (anything but `enabled`). */
export interface SkillConfigChangePatch {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
}

/**
 * True when a patch changes the skill's CONTENT (vs. just toggling `enabled`)
 * relative to the existing row — a content change bumps the version and
 * snapshots `skill_versions`.
 *
 * `enabled` is deliberately excluded: it is a kill switch, not content, so
 * muting a skill must not spawn a version byte-identical to the last one.
 */
export function isSkillConfigChange(
  existing: Pick<SkillRowLike, 'name' | 'description' | 'type' | 'body'>,
  patch: SkillConfigChangePatch,
): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.type !== undefined && patch.type !== existing.type) ||
    (patch.body !== undefined && patch.body !== existing.body)
  );
}
