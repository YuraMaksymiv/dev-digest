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

## Decisions

## Recurring Errors & Fixes

## Session Notes

## Open Questions
