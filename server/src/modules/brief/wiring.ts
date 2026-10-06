import type { Container } from '../../platform/container.js';
import { BlastService } from '../blast/service.js';
import { resolveLinkedIssueSignal } from '../reviews/intent-loader.js';
import { BriefRepository } from './repository.js';
import { BriefService } from './service.js';

/**
 * Returns a lazy getter for one BriefService per app: the in-flight map must
 * outlive a request, and a validation 422 must never touch db-backed deps.
 * Not a container getter: BlastService and the intent-loader import the
 * Container type, so registering it there would be a container -> module ->
 * container cycle.
 */
export function createBriefServiceGetter(container: Container): () => BriefService {
  let instance: BriefService | undefined;
  return () =>
    (instance ??= new BriefService({
      repo: new BriefRepository(container.db),
      reviewRepo: container.reviewRepo,
      blast: new BlastService(container),
      linkedIssue: (repo, pull) => resolveLinkedIssueSignal(container, repo, pull),
      specs: container.projectContextService,
      tokenizer: container.tokenizer,
      llm: (provider) => container.llm(provider),
      log: {
        info: (obj, msg) => console.info(msg, JSON.stringify(obj)),
        warn: (obj, msg) => console.warn(msg, JSON.stringify(obj)),
      },
    }));
}
