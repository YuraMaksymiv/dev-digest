import { pgTable, uuid, text, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { repos } from './repos';
import { agents } from './agents';
import { skills } from './skills';

// ============================================================ Project context
// Repo-relative doc paths attached to an agent or skill, per repo. Content is
// never stored; it is read from the clone at run time.

export const agentContextDocs = pgTable(
  'agent_context_docs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: now(),
  },
  (t) => ({
    uniq: uniqueIndex('agent_context_docs_uniq').on(t.agentId, t.repoId, t.path),
    orderIdx: index('agent_context_docs_order_idx').on(t.agentId, t.repoId, t.position),
    repoIdx: index('agent_context_docs_repo_idx').on(t.repoId),
  }),
);

export const skillContextDocs = pgTable(
  'skill_context_docs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: now(),
  },
  (t) => ({
    uniq: uniqueIndex('skill_context_docs_uniq').on(t.skillId, t.repoId, t.path),
    orderIdx: index('skill_context_docs_order_idx').on(t.skillId, t.repoId, t.position),
    repoIdx: index('skill_context_docs_repo_idx').on(t.repoId),
  }),
);
