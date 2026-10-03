import { wrapUntrusted } from '../domain/untrusted.js';
import type { ToolOutput } from '../domain/types.js';
import type { DevDigestApi } from '../ports.js';
import { BLAST_NO_DATA_HINT } from './constants.js';

export class BlastService {
  constructor(private readonly api: DevDigestApi) {}

  async getBlastRadius(repo: string, prNumber: number): Promise<ToolOutput> {
    const pr = await this.api.lookupPull(repo, prNumber);
    const blast = await this.api.getBlastRadius(pr.prId);
    // Symbol and file names come from the PR, so the JSON is framed as data; our own hint stays outside.
    const body = wrapUntrusted(JSON.stringify(blast));
    const text = blast.degraded === true && blast.reason === 'no_data' ? `${BLAST_NO_DATA_HINT}\n${body}` : body;
    return { text, isError: false };
  }
}
