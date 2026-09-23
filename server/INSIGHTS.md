# Insights — server/

Non-obvious things learned while building `server/`. Captured by the
[`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md)
skill. Append-only — correct a stale entry with a new dated note, never
rewrite it. Anti-banality test: if the code alone already tells the story,
skip it.

## What Works

## What Doesn't Work

## Codebase Patterns & Tool/Library Notes

- 2026-09-22 — `pnpm --dir server db:generate` asks "created or renamed from another column?" whenever ONE table both gains and loses a column in the same change, and that prompt needs a TTY: piping newlines is ignored and the command hangs until killed (`script -q /dev/null` did not help either). Split the change into two generates instead — first add the new columns with the old one still in the schema, then remove the old one — which gives two unambiguous migrations and no prompt. Evidence: `migrations/0012_chubby_hiroim.sql` (adds) + `0013_fair_retro_girl.sql` (drops `accepted`).
- 2026-09-22 — `/pr-self-review` FALSE-POSITIVE CRITICAL, recorded per that skill's "keeping the gate trusted" rule: a reviewer flagged `0013_*.sql` `DROP COLUMN "accepted"` as data loss with no backfill. It is unreachable — the immediately preceding `0012` does `ADD COLUMN ... text NOT NULL` with no DEFAULT, which Postgres rejects on any non-empty table, and `db/migrate.ts` stops on the first failing file, so `0013` can only ever run against a table that was already empty. When judging a migration finding, read the whole batch in journal order, not the one file cited.
- 2026-09-21 — A new module's `helpers.ts` must NOT import its row types from its own `repository.ts`: the repository imports the helpers' pure rules back, and `pnpm --dir server arch` fails the pair with `no-circular`. `modules/agents` does exactly this (`agents/helpers.ts:3`) and looks like the precedent to copy, but it only passes because it sits in `.dependency-cruiser-known-violations.json`. `helpers-are-pure` also blocks the obvious alternative (`db/rows.ts` is `^src/db/`, and `tsPreCompilationDeps: true` makes even a type-only import count). Declare the row shape structurally inside `helpers.ts` instead — see `modules/skills/helpers.ts` (`SkillRowLike`).
- 2026-09-21 — Drizzle's `text('col', { enum: [...] })` is a TypeScript narrowing ONLY and emits no DDL, so a schema that reads as constrained accepts any string at the database. A real constraint needs an explicit `check()` in the third `pgTable` argument; drizzle-kit does then emit `ALTER TABLE … ADD CONSTRAINT … CHECK`. Evidence: `src/db/schema/skills.ts` + `migrations/0011_tired_raza.sql`. `ADD CONSTRAINT … CHECK` validates existing rows, so add these while a table is still empty.
- 2026-09-21 — `AgentsRepository.list`/`listEnabled` had no `ORDER BY`, which only stayed stable because agent rows were rarely updated. Once a skill-link change started bumping `agents.version` on every checkbox click (L02), each UPDATE moved the row in the heap and the editor's agent rail reshuffled under the cursor. Any list a UI renders needs an explicit order even when the rows look naturally ordered today.
- 2026-09-16 — `run_traces` is written through a Zod parse (`buildRunTrace`, `platform/trace-builder.ts:38`) but read back with a bare cast (`getRunTrace`, `modules/reviews/repository/run.repo.ts` — `row.trace as RunTrace`). Adding a REQUIRED field to `RunTrace`/`RunStats` therefore type-lies about every already-persisted document: the field is `undefined` at runtime. New trace fields must be `.nullish()`.
- 2026-09-16 — `docker exec devdigest-postgres psql …` with a heredoc silently runs NOTHING: without `-i`, docker does not forward stdin, and psql exits 0 having read an empty script. The DB looks unchanged with no error anywhere — use `docker exec -i` for any piped/heredoc SQL.
- 2026-09-20 — (evidence for the 2026-09-16 `docker exec` note above) the container name it refers to is fixed at `docker-compose.yml:6` (`container_name: devdigest-postgres`) and reused by `scripts/dev.sh:49`; that is the container any ad-hoc `psql` runs against.
- 2026-09-20 — The PR list endpoint computes all three of its rollups on read — score, summed cost, severity breakdown + preview — as separate `IN`-queries grouped in JS (`src/modules/pulls/routes.ts:118-215`), with the pure derivations kept in `src/modules/pulls/status.ts` so they unit-test without a database. Adding a fourth column means following that shape, not denormalising onto `pull_requests`: nothing can go stale, and `test/pulls-status.test.ts` covers the maths with no Testcontainers boot.

## Decisions

## Recurring Errors & Fixes

## Session Notes

## Open Questions
