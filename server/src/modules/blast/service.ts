import type { BlastRadius } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { mapBlastResult, refineBlastReason } from './helpers.js';

/**
 * Blast service. Loads the PR's changed files, asks the repo-intel facade ONCE,
 * and shapes the result into the `BlastRadius` contract. Degradation is data
 * (a 200 with `degraded` + `reason`), never an error.
 */
export class BlastService {
  constructor(private container: Container) {}

  async getBlast(workspaceId: string, prId: string): Promise<BlastRadius> {
    const { reviewRepo, repoIntel, config } = this.container;
    const pull = await reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    // pr_files is filled when the PR detail is first opened; it is empty for a
    // PR that was imported but never viewed (reported as `no_data`).
    const files = await reviewRepo.getPrFiles(prId);
    const result = await repoIntel.getBlastRadius(
      pull.repoId,
      files.map((f) => f.path),
    );

    const state = await repoIntel.getIndexState(pull.repoId);
    const reason = refineBlastReason(result, state, config.repoIntelEnabled);
    return mapBlastResult({ ...result, degraded: reason !== null, reason: reason ?? undefined });
  }
}
