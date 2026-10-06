import { z } from 'zod';

/**
 * Project Context — repo markdown docs (`specs/`, `docs/`, `insights/`)
 * attached by hand to agents and skills, injected into the review prompt as an
 * UNTRUSTED `## Project context` block. Docs are view-only.
 */

export const ContextDocRoot = z.enum(['specs', 'docs', 'insights']);
export type ContextDocRoot = z.infer<typeof ContextDocRoot>;

/** Token caps the server applies at run time; the UI sums against them. */
export const ContextLimits = z.object({
  per_doc_tokens: z.number().int(),
  total_tokens: z.number().int(),
});
export type ContextLimits = z.infer<typeof ContextLimits>;

export const ContextDoc = z.object({
  /** Repo-relative path, forward slashes. */
  path: z.string(),
  root_type: ContextDocRoot,
  size_bytes: z.number().int(),
  /** Tokens of the doc as injected (capped at `limits.per_doc_tokens`). */
  tokens: z.number().int(),
  /** Distinct agents with a direct attachment or linked to a skill with it. */
  used_by: z.number().int(),
});
export type ContextDoc = z.infer<typeof ContextDoc>;

export const ContextDocList = z.object({
  docs: z.array(ContextDoc),
  /** Matched file count (may exceed `docs.length` when truncated). */
  total_files: z.number().int(),
  /** Sum of `tokens` over the returned docs. */
  total_tokens: z.number().int(),
  truncated: z.boolean(),
  reason: z.enum(['not_cloned']).nullable(),
  limits: ContextLimits,
});
export type ContextDocList = z.infer<typeof ContextDocList>;

export const ContextDocContent = z.object({
  path: z.string(),
  content: z.string(),
  tokens: z.number().int(),
});
export type ContextDocContent = z.infer<typeof ContextDocContent>;

export const ContextAttachment = z.object({
  path: z.string(),
  position: z.number().int(),
  /** `missing` = the file vanished from the clone after it was attached. */
  status: z.enum(['ok', 'missing']),
  tokens: z.number().int(),
});
export type ContextAttachment = z.infer<typeof ContextAttachment>;

export const ContextAttachmentList = z.object({
  repo_id: z.string(),
  attachments: z.array(ContextAttachment),
  limits: ContextLimits,
});
export type ContextAttachmentList = z.infer<typeof ContextAttachmentList>;

/** PUT body for `/agents/:id/context` and `/skills/:id/context`. Ordered; replaces the owner+repo set. */
export const ContextAttachmentPut = z.object({
  repo_id: z.string(),
  paths: z.array(z.string()),
});
export type ContextAttachmentPut = z.infer<typeof ContextAttachmentPut>;

/** Per-doc outcome recorded in the run trace. */
export const SpecDetail = z.object({
  path: z.string(),
  tokens: z.number().int(),
  source: z.enum(['agent', 'skill']),
  /** Skill name when `source` is `skill`; null for the agent's own docs. */
  source_name: z.string().nullable(),
  status: z.enum(['read', 'truncated', 'missing', 'unreadable', 'over_budget']),
  /** Root the doc lives under; absent on traces persisted before grouping. */
  root_type: ContextDocRoot.nullish(),
});
export type SpecDetail = z.infer<typeof SpecDetail>;
