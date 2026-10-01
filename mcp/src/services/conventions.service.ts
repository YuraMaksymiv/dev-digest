import { formatConventions } from '../domain/format.js';
import type { ToolOutput } from '../domain/types.js';
import type { DevDigestApi } from '../ports.js';
import { resolveRepo } from './resolve.js';

export class ConventionsService {
  constructor(private readonly api: DevDigestApi) {}

  async getConventions(repo: string, section: string | undefined): Promise<ToolOutput> {
    const ref = resolveRepo(await this.api.listRepos(), repo);
    const all = await this.api.listConventions(ref.id);
    const picked = section ? all.filter((c) => c.category === section) : all;
    return { text: formatConventions(picked, section), isError: false };
  }
}
