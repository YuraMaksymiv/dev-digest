# Routing — which skill reviews which file

Data, not prose. Adding a skill to the review is a one-row edit here.

A file may match several rows. A skill runs **once per file group**, not once per
file — batch all of a skill's files into a single subagent so it can see them
together.

## The table

| # | Path pattern | Skills |
|---|---|---|
| 1 | `client/src/**/*.tsx` · `client/src/**/*.ts` (non-test) | `frontend-ui-architecture`, `react-best-practices` |
| 2 | `client/src/app/**` | **+** `next-best-practices` (routing, layouts, `"use client"` boundary) |
| 3 | `client/src/**/*.test.tsx` · `client/src/**/*.test.ts` | `react-testing-library` |
| 4 | `client/src/vendor/ui/**` | `frontend-ui-architecture` + `/showcase` registration check |
| 5 | `client/messages/**` | i18n key-consistency check (no LLM tier) |
| 6 | `server/src/modules/**` · `server/src/adapters/**` · `server/src/platform/**` | `onion-architecture`, `fastify-best-practices` |
| 7 | `server/src/modules/**/routes.ts` | **+** `security` |
| 8 | `server/src/db/schema/**` | `drizzle-orm-patterns`, `postgresql-table-design` |
| 9 | `server/src/db/migrations/**` | mechanical only — see [`critical.md`](critical.md) #1 |
| 10 | `reviewer-core/src/**` | `onion-architecture` (core purity), `typescript-expert` |
| 11 | `**/vendor/shared/**` | `zod`, `typescript-expert` + drift check |
| 12 | any `.ts`/`.tsx` declaring a Zod schema | `zod` |
| 13 | any source file | `security` (diff-scoped) |
| 14 | any file whose diff changes a type signature | `typescript-expert` |
| 15 | `e2e/flows/*.json` | flow order + naming check (no LLM tier) |
| 16 | `*.md`, `CLAUDE.md`, `INSIGHTS.md` | doc-consistency check (no LLM tier) |
| 17 | `.github/workflows/**` · `scripts/**` | `security` (supply chain, secrets in CI) |

## Rules for using the table

**Skip skills with no matching files.** A run that fans out five subagents for
one changed file is the reason people stop running the gate.

**Rows 5, 9, 15, 16 have no LLM tier.** They are mechanical checks; a model
adds nothing and costs time. Row 9 in particular: migrations are generated, so
the only question is whether an existing one was edited, which Phase 1 answers.

**Row 13 is diff-scoped, always.** `security` on every changed file is affordable
only because it sees hunks, not whole files.

**Row 2 is additive to row 1**, not a replacement — an App Router component still
gets the React and architecture skills.

## Adding a skill to the routing

1. Add a row with the narrowest path pattern that is correct.
2. Decide whether it has an LLM tier or is mechanical.
3. If it can produce a blocking finding, add the category to
   [`critical.md`](critical.md) with its reasoning — otherwise its findings cap
   at WARNING.
4. Note it in the `README.md` changelog.

## Skills deliberately not routed

| Skill | Why not |
|---|---|
| `engineering-insights` | Session-level memory, not a review pass. Used *after* a run to record false positives. |
| `mermaid-diagram` | Authoring aid; nothing to review against. |
