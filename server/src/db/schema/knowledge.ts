import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  doublePrecision,
  integer,
  vector,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

/**
 * Mirrors `ConventionCategory` / `ConventionStatus` in
 * `vendor/shared/contracts/knowledge.ts`. Declared here as well because the
 * schema layer must not import from the contracts layer, and both the column
 * narrowing and the CHECK below need the literal list.
 */
const CONVENTION_CATEGORIES = [
  'naming',
  'structure',
  'error_handling',
  'async',
  'typing',
  'testing',
  'imports',
  'api',
] as const;

const CONVENTION_STATUSES = ['pending', 'accepted', 'rejected'] as const;

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

/**
 * A house rule the extractor proposed for one repo, with the code that proves
 * it. `evidence_line` and `evidence_snippet` are what the GATE verified in the
 * cloned file, never what the model claimed — a candidate whose snippet is not
 * in the cited file never reaches this table.
 */
export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    category: text('category', {
      enum: CONVENTION_CATEGORIES,
    }).notNull(),
    rule: text('rule').notNull(),
    // One sentence on what a reviewer should flag. Editable, so nullable for
    // a candidate the model returned without one.
    rationale: text('rationale'),
    evidencePath: text('evidence_path'),
    // 1-based, as located by the gate. Null when the file was sampled but the
    // snippet matched nowhere a line number could be pinned to.
    evidenceLine: integer('evidence_line'),
    evidenceSnippet: text('evidence_snippet'),
    confidence: doublePrecision('confidence'),
    // Three states, not a boolean: a re-scan replaces only `pending` rows, so
    // a rule the user rejected never comes back.
    status: text('status', { enum: CONVENTION_STATUSES }).notNull().default('pending'),
    createdAt: now(),
  },
  (t) => ({
    repoCreatedIdx: index('conventions_repo_created_idx').on(t.repoId, t.createdAt),
    // `text(..., { enum })` narrows TypeScript only and emits no DDL — these
    // CHECKs are what actually stops a bad value reaching the column.
    categoryCk: check(
      'conventions_category_ck',
      sql`${t.category} in ('naming', 'structure', 'error_handling', 'async', 'typing', 'testing', 'imports', 'api')`,
    ),
    statusCk: check(
      'conventions_status_ck',
      sql`${t.status} in ('pending', 'accepted', 'rejected')`,
    ),
  }),
);
