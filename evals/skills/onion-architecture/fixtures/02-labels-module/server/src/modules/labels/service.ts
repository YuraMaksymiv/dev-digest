import type { FastifyReply } from 'fastify';
import type { Container } from '../../platform/container.js';
import { LabelRepository, type LabelRow } from './repository.js';
import { normalizeLabels } from './helpers.js';

export class LabelService {
  private repo: LabelRepository;

  constructor(private container: Container) {
    this.repo = new LabelRepository(container.db);
  }

  async list(workspaceId: string, prId: string): Promise<LabelRow[]> {
    return this.repo.listForPull(workspaceId, prId);
  }

  async replace(
    workspaceId: string,
    userId: string,
    prId: string,
    labels: string[],
    reply: FastifyReply,
  ): Promise<LabelRow[] | { error: string }> {
    const pr = await this.repo.findPull(workspaceId, prId);
    if (!pr) {
      reply.status(404);
      return { error: 'pull request not found' };
    }

    const next = normalizeLabels(labels);
    await this.repo.deleteForPull(workspaceId, prId);
    await this.repo.insertMany(
      next.map((name) => ({ workspaceId, prId, name, createdBy: userId })),
    );
    await this.repo.touchPull(prId);

    reply.status(200);
    return this.repo.listForPull(workspaceId, prId);
  }
}
