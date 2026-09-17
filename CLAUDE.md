# DevDigest — repo map

Local-first AI PR review. Course starter: minimal working slice (import a
PR → run an agent review end to end); each course lesson adds one feature
back. Full architecture + lesson map: [README.md](README.md).

## Stack

Node ≥22 · pnpm ≥10 · Docker (Postgres 16 + pgvector) · TypeScript 5.7
everywhere.

## Run / build / test

- `./scripts/dev.sh` — one-shot local boot (Postgres + API :3001 + web :3000).
- `./scripts/e2e.sh` — hermetic e2e stack on isolated ports/DB.
- Per-package `pnpm dev|build|test|typecheck` — see each module's own
  `CLAUDE.md`.

## Map

| Path | Package | Role |
|---|---|---|
| `server/` | `@devdigest/api` | Fastify API, Drizzle/Postgres, repo-intel indexer |
| `client/` | `@devdigest/web` | Next.js 15 studio UI |
| `reviewer-core/` | `@devdigest/reviewer-core` | Pure engine: diff → prompt → LLM → grounded findings |
| `e2e/` | `@devdigest/e2e` | Deterministic browser flows (agent-browser, no LLM) |
| `server/src/vendor/shared` | `@devdigest/shared` | Zod contracts, mirrored (not npm-published) into `client/src/vendor/shared` |
| `docs/agent-prompts/` | — | Reference prompts for the built-in review agents |

## Non-default conventions

- **No monorepo/workspace.** Each package has its own lockfile; cross-package
  imports go through tsconfig path aliases (`@devdigest/*`), not npm.
- `@devdigest/shared` is **duplicated**, not symlinked, into `server/` and
  `client/` — the two copies can and do drift; check both before assuming one
  is canonical.
- Server never migrates on boot — `pnpm --dir server db:migrate` is manual.

## Gotchas

- `relation ... does not exist` on first run → migrations weren't applied.
- Port 5432 busy → another Postgres is running; stop it or remap the host
  port in `docker-compose.yml`.
- `docker compose down -v` deletes the `devdigest_pgdata` volume — every
  imported repo/review with it. Don't, unless resetting on purpose.

## Per-module docs

Each module has its own `CLAUDE.md`, `README.md`, `docs/`, `specs/`,
`INSIGHTS.md`: [server](server/CLAUDE.md) · [client](client/CLAUDE.md) ·
[reviewer-core](reviewer-core/CLAUDE.md) · [e2e](e2e/CLAUDE.md)

Always read a module's `INSIGHTS.md` before starting work in it, via the
[`engineering-insights`](.claude/skills/engineering-insights/SKILL.md) skill
— and check it again at session end, writing back only if something
substantial and new came up.
