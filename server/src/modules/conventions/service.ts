import type {
  ConventionCandidate,
  ConventionExtractResult,
  ConventionSkillDraft,
  ConventionStatus,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import {
  CONFIG_SAMPLE_PATHS,
  CONVENTIONS_FEATURE_MODEL,
  EXTRACTION_TEMPERATURE,
  MAX_CANDIDATES,
  MAX_SAMPLE_CHARS,
  TOP_FILE_SAMPLE_COUNT,
} from './constants.js';
import {
  buildSkillDraft,
  gateCandidates,
  renderSample,
  toConventionDto,
  truncateFile,
  type SampledFile,
} from './helpers.js';
import {
  ConventionExtraction,
  EXTRACTION_SCHEMA_NAME,
  SYSTEM_PROMPT,
  buildUserPrompt,
} from './prompt.js';
import { ConventionsRepository, type RepoRefRow } from './repository.js';

/**
 * Conventions extractor: find the house rules a repository already follows,
 * prove each one with code, and merge the accepted ones into a skill.
 *
 * Three stages, and only the middle one is a model:
 *
 *   SAMPLE (code) → PROPOSE (one cheap call) → VERIFY (code)
 *
 * The premise is that a model is good at noticing a pattern and bad at
 * remembering where it saw it. So code picks every file the model reads, and
 * code checks every citation it returns: a rule whose snippet is not in the
 * file it cites is DROPPED, not merely scored low.
 */
export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.repo.listByRepo(workspaceId, repoId);
    return rows.map(toConventionDto);
  }

  /** One scan: sample → propose → gate → replace the pending rows. */
  async extract(workspaceId: string, repoId: string): Promise<ConventionExtractResult> {
    const ref = await this.repo.getRepoRef(workspaceId, repoId);
    if (!ref) throw new NotFoundError('Repository not found');
    if (!ref.clonePath) {
      throw new ValidationError('Repository is not cloned yet — add and index it first');
    }

    const sample = await this.collectSample(repoId, ref);
    // Bail BEFORE the model call: a scan of nothing would still be billed.
    if (sample.length === 0) {
      throw new ValidationError('No readable files in the clone — index the repository first');
    }

    const choice = await resolveFeatureModel(this.container, workspaceId, CONVENTIONS_FEATURE_MODEL);
    const llm = await this.container.llm(choice.provider);
    const res = await llm.completeStructured({
      model: choice.model,
      schema: ConventionExtraction,
      schemaName: EXTRACTION_SCHEMA_NAME,
      temperature: EXTRACTION_TEMPERATURE,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(ref.fullName, renderSample(sample)) },
      ],
    });

    // The cap is stated in the prompt AND enforced here — a model that ignores
    // it must not turn one scan into forty rows.
    const proposed = res.data.conventions.slice(0, MAX_CANDIDATES);

    // Rules the user already ruled on are part of the dedupe set, which is what
    // stops a re-scan re-proposing something they rejected.
    const before = await this.repo.listByRepo(workspaceId, repoId);
    const decided = before.filter((r) => r.status !== 'pending').map((r) => r.rule);

    const gate = gateCandidates(proposed, sample, decided);
    await this.repo.replacePending(workspaceId, repoId, gate.kept);

    const rows = await this.repo.listByRepo(workspaceId, repoId);
    return {
      candidates: rows.map(toConventionDto),
      proposed: proposed.length,
      dropped_ungrounded: gate.droppedUngrounded,
      dropped_duplicate: gate.droppedDuplicate,
      sampled_files: sample.map((f) => f.path),
      provider: choice.provider,
      model: res.model,
      cost_usd: res.costUsd,
    };
  }

  async patch(
    workspaceId: string,
    id: string,
    patch: { rule?: string; rationale?: string; status?: ConventionStatus },
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toConventionDto(row) : undefined;
  }

  async remove(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.remove(workspaceId, id);
  }

  /**
   * Assemble the accepted candidates into a skill DRAFT. Writes nothing: the
   * user edits it in a modal and `POST /skills` is what makes it exist, the
   * same preview-then-confirm flow skill import uses.
   */
  async skillDraft(workspaceId: string, repoId: string): Promise<ConventionSkillDraft> {
    const ref = await this.repo.getRepoRef(workspaceId, repoId);
    if (!ref) throw new NotFoundError('Repository not found');
    const rows = await this.repo.listByRepo(workspaceId, repoId);
    const accepted = rows.filter((r) => r.status === 'accepted').map(toConventionDto);
    if (accepted.length === 0) {
      throw new ValidationError('Accept at least one convention before creating a skill');
    }
    return buildSkillDraft(ref.name, accepted);
  }

  /**
   * Stage 1 — 100% code, no model. The configs state conventions the source
   * only implies; the top-ranked files show whether the team actually follows
   * them. Which files these are is decided here, so two scans of an unchanged
   * repo send the model the same bytes.
   */
  private async collectSample(repoId: string, ref: RepoRefRow): Promise<SampledFile[]> {
    const gitRef = { owner: ref.owner, name: ref.name };
    const out: SampledFile[] = [];
    const seen = new Set<string>();
    let budget = MAX_SAMPLE_CHARS;

    const add = async (path: string): Promise<void> => {
      if (budget <= 0 || seen.has(path)) return;
      seen.add(path);
      let raw: string;
      try {
        raw = await this.container.git.readFile(gitRef, path);
      } catch {
        // A config the repo simply does not have. Every repo is missing most
        // of the wish-list, so this is the normal path, not an error.
        return;
      }
      const content = truncateFile(raw);
      if (content.trim().length === 0) return;
      out.push({ path, content });
      budget -= content.length;
    };

    for (const path of CONFIG_SAMPLE_PATHS) await add(path);
    const top = await this.container.repoIntel.getConventionSamples(repoId, TOP_FILE_SAMPLE_COUNT);
    for (const path of top) await add(path);
    return out;
  }
}
