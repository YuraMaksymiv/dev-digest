# server/ — @devdigest/api

Fastify API + Drizzle ORM on Postgres (pgvector). Clones/indexes repos
(`repo-intel`), imports PRs from GitHub, orchestrates reviews via
`reviewer-core`. Full API map: [README.md](README.md).

## Stack

Fastify 5 · Drizzle ORM 0.38 · Postgres 16 / pgvector · Zod 3 · tsx (dev) ·
TypeScript 5.7.

## Commands

- `pnpm dev` — tsx watch, API on :3001
- `pnpm db:migrate` / `pnpm db:generate` / `pnpm db:seed`
- `pnpm test` — vitest, hermetic by default;
  `pnpm exec vitest run .it.test` — Postgres-backed integration tests
  (testcontainers, needs Docker)
- `pnpm typecheck`

## Map

- `src/modules/*` — one folder per domain: `repos`, `pulls`, `agents`,
  `skills`, `conventions`, `reviews`, `repo-intel`, `settings`, `polling`,
  `workspace`.
- `src/adapters/*` — external systems: `github`, `git`, `llm`, `embedder`,
  `astgrep`, `depgraph`, `tokenizer`, `secrets`, `auth`.
- `src/platform/*` — cross-cutting: `config`, `container` (DI), `grounding`,
  `jobs`, `model-router`, `resilience`, `sse`, `trace-builder`.
- `src/db/schema/*` — one file per domain; `src/db/migrations/` is
  generated — do not hand-edit.
- `src/vendor/shared/` — mirrored copy of `@devdigest/shared`; see root
  `CLAUDE.md`.

## Non-default conventions

- Migrations are **not** run on boot — always `pnpm db:migrate` after
  pulling schema changes.
- Integration tests (`*.it.test.ts`) need Docker (testcontainers);
  everything else is hermetic.
- `repo-intel` clones real repos to disk — check its own module for the
  cache/workspace location before assuming it's stateless.

## Gotchas

- `vector` type errors → the pgvector extension comes from migration
  `0000`; make sure migrations ran against the DB you're actually hitting.
- Don't hand-edit `src/db/migrations/` — regenerate via `pnpm db:generate`
  from schema changes.

## More

[docs/](docs/) · [specs/](specs/) · [INSIGHTS.md](INSIGHTS.md)
