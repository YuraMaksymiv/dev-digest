import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { OctokitGitHubClient } from '../../adapters/github/octokit.js';
import { NotificationRepository } from './repository.js';
import { renderNotification } from './helpers.js';
import { GITHUB_TOKEN_SECRET, type NotifyChannel } from './constants.js';

export interface NotifyResult {
  id: string;
  channel: NotifyChannel;
  sent_at: string;
}

export class NotificationService {
  private repo: NotificationRepository;

  constructor(private container: Container) {
    this.repo = new NotificationRepository(container.db);
  }

  async notify(
    workspaceId: string,
    userId: string,
    prId: string,
    channel: NotifyChannel,
  ): Promise<NotifyResult> {
    const pr = await this.repo.getPull(workspaceId, prId);
    if (!pr) throw new NotFoundError(`PR ${prId} not found`);

    const token = await this.container.secrets.get(GITHUB_TOKEN_SECRET);
    const github = new OctokitGitHubClient(token ?? '');
    const author = await github.currentLogin();

    const body = await renderNotification(channel, {
      title: pr.title,
      number: pr.number,
      author,
    });

    const saved = await this.repo.insert({ workspaceId, prId, channel, body, createdBy: userId });
    return { id: saved.id, channel, sent_at: saved.sentAt };
  }
}
