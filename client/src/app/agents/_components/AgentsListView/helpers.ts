import type { Agent } from "@devdigest/shared";

/**
 * Case-insensitive filter over an agent's name + description.
 *
 * Generic in the row type so it keeps whatever the caller passed — the list
 * renders `AgentSummary` (agent + `skills_count`) and narrowing to `Agent` here
 * would drop the count on the way through.
 */
export function filterAgents<T extends Agent>(agents: T[], search: string): T[] {
  const q = search.trim().toLowerCase();
  if (!q) return agents;
  return agents.filter((a) => `${a.name} ${a.description}`.toLowerCase().includes(q));
}
