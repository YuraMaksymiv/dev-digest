import type { AgentSkillDetail, SkillSummary, SkillType } from "@devdigest/shared";

/** Pure row model for the agent's Skills tab. */

export interface SkillRowState {
  id: string;
  name: string;
  description: string;
  type: SkillType;
  /** `skills.enabled` — the skill's global kill switch. */
  globallyEnabled: boolean;
  /** `agent_skills.enabled` — this agent's switch. */
  enabled: boolean;
}

/**
 * Every skill in the workspace becomes a row: linked ones first, in their saved
 * order, then the rest alphabetically as unchecked rows. A skill created after
 * this agent was last saved therefore shows up at the end rather than vanishing.
 */
export function buildRows(all: SkillSummary[], linked: AgentSkillDetail[]): SkillRowState[] {
  const byId = new Map(all.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const rows: SkillRowState[] = [];

  for (const link of [...linked].sort((a, b) => a.order - b.order)) {
    const skill = byId.get(link.id);
    if (!skill) continue; // deleted between the two fetches
    seen.add(link.id);
    rows.push({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      type: skill.type,
      globallyEnabled: skill.enabled,
      enabled: link.link_enabled,
    });
  }

  const rest = all
    .filter((s) => !seen.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      type: s.type,
      globallyEnabled: s.enabled,
      enabled: false,
    }));

  return [...rows, ...rest];
}

/** Move the row at `from` to index `to`, clamped. Returns a new array. */
export function moveRow(rows: SkillRowState[], from: number, to: number): SkillRowState[] {
  if (from === to || from < 0 || from >= rows.length) return rows;
  const target = Math.max(0, Math.min(rows.length - 1, to));
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  if (!moved) return rows;
  next.splice(target, 0, moved);
  return next;
}

export function toggleRow(
  rows: SkillRowState[],
  id: string,
  enabled: boolean,
): SkillRowState[] {
  return rows.map((r) => (r.id === id ? { ...r, enabled } : r));
}

/**
 * The whole ordered set, always — order is a property of the set, so a partial
 * payload would silently renumber whatever it omitted.
 */
export function toPayload(rows: SkillRowState[]): Array<{ skill_id: string; enabled: boolean }> {
  return rows.map((r) => ({ skill_id: r.id, enabled: r.enabled }));
}

/**
 * How many rows actually reach the prompt: a globally disabled skill does not,
 * however this agent's switch is set.
 */
export function countEnabled(rows: SkillRowState[]): number {
  return rows.filter((r) => r.enabled && r.globallyEnabled).length;
}

export function filterRows(rows: SkillRowState[], query: string): SkillRowState[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
  );
}
