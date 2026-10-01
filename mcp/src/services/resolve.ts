import { ToolError } from '../domain/errors.js';
import type { AgentInfo, RepoRef } from '../domain/types.js';

export function resolveAgent(agents: readonly AgentInfo[], query: string): AgentInfo {
  const byId = agents.find((a) => a.id === query);
  if (byId) return byId;

  const wanted = query.trim().toLowerCase();
  const byName = agents.filter((a) => a.name.toLowerCase() === wanted);
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) {
    const ids = byName.map((a) => `${a.name} (id: ${a.id})`).join(', ');
    throw new ToolError(`Agent name "${query}" is ambiguous: ${ids}. Pass the id as \`agent\`.`);
  }

  const available = agents.map((a) => a.name).join(', ') || 'none configured';
  throw new ToolError(`No agent matches "${query}". Available agents: ${available}. Call list_agents for ids.`);
}

export function resolveRepo(repos: readonly RepoRef[], fullName: string): RepoRef {
  const wanted = fullName.toLowerCase();
  const match = repos.find((r) => r.fullName.toLowerCase() === wanted);
  if (!match) {
    throw new ToolError(`Repo ${fullName} is not imported into DevDigest. Import it in the DevDigest UI first, then retry.`);
  }
  return match;
}
