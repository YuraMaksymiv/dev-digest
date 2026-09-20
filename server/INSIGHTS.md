# Insights — server/

Non-obvious things learned while building `server/`. Captured by the
[`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md)
skill. Append-only — correct a stale entry with a new dated note, never
rewrite it. Anti-banality test: if the code alone already tells the story,
skip it.

## What Works

## What Doesn't Work

## Codebase Patterns & Tool/Library Notes

- 2026-09-16 — `run_traces` is written through a Zod parse (`buildRunTrace`, `platform/trace-builder.ts:38`) but read back with a bare cast (`getRunTrace`, `modules/reviews/repository/run.repo.ts` — `row.trace as RunTrace`). Adding a REQUIRED field to `RunTrace`/`RunStats` therefore type-lies about every already-persisted document: the field is `undefined` at runtime. New trace fields must be `.nullish()`.
- 2026-09-16 — `docker exec devdigest-postgres psql …` with a heredoc silently runs NOTHING: without `-i`, docker does not forward stdin, and psql exits 0 having read an empty script. The DB looks unchanged with no error anywhere — use `docker exec -i` for any piped/heredoc SQL.
- 2026-09-20 — (evidence for the 2026-09-16 `docker exec` note above) the container name it refers to is fixed at `docker-compose.yml:6` (`container_name: devdigest-postgres`) and reused by `scripts/dev.sh:49`; that is the container any ad-hoc `psql` runs against.
- 2026-09-20 — The PR list endpoint computes all three of its rollups on read — score, summed cost, severity breakdown + preview — as separate `IN`-queries grouped in JS (`src/modules/pulls/routes.ts:118-215`), with the pure derivations kept in `src/modules/pulls/status.ts` so they unit-test without a database. Adding a fourth column means following that shape, not denormalising onto `pull_requests`: nothing can go stale, and `test/pulls-status.test.ts` covers the maths with no Testcontainers boot.

## Decisions

## Recurring Errors & Fixes

## Session Notes

## Open Questions
