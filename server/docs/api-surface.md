# HTTP surface

Every route the API serves, grouped by the module that owns it
(`src/modules/<domain>/routes.ts`). Registration is static — `src/app.ts`
registers the module plugins, there is no auto-discovery and no route prefix,
so the paths below are the full paths.

All handlers resolve the caller's workspace first (`modules/_shared/context.ts`
→ `getContext`) and scope every query by `workspaceId`; `:id` params are
validated by the shared `IdParams` schema.

## repos — `modules/repos`

| Route | What it does |
|---|---|
| `POST /repos` | import a repo (`RepoInput`) |
| `GET /repos` | list the workspace's repos |
| `POST /repos/:id/refresh` | re-sync a repo from GitHub |
| `DELETE /repos/:id` | drop a repo and everything under it |

## pulls — `modules/pulls`

| Route | What it does |
|---|---|
| `GET /repos/:id/pulls` | the PR list. Syncs from GitHub when a token exists, then serves persisted rows. Derives per row: review `status` (`status.ts` → `deriveReviewStatus`), latest-review `score`, summed `cost_usd` of completed runs, the latest review's `findings` breakdown and its `findings_preview` |
| `GET /pulls/:id` | PR detail: files/diff, commits, body, linked issue |
| `GET /pulls/:id/comments` | GitHub review comments (empty list when offline) |
| `POST /pulls/:id/comments` | post a review comment back to GitHub |

Local-first rule: a missing/broken GitHub token never fails a read — the handler
logs a warning and serves what Postgres already has.

## reviews — `modules/reviews`

| Route | What it does |
|---|---|
| `POST /pulls/:id/review` | start a run (all enabled agents, or one `agentId`) |
| `GET /runs/:id/events` | SSE stream of a live run |
| `GET /pulls/:id/runs/active` | runs currently `status='running'` — server-sourced, so live state survives a reload |
| `GET /pulls/:id/runs` | run history (`RunSummary[]`: tokens, cost, findings count, blockers, score) |
| `POST /runs/:id/cancel` · `DELETE /runs/:id` | cancel a live run · delete a run and its logs |
| `GET /runs/:id/trace` | the single-document `RunTrace` behind the trace drawer |
| `GET /pulls/:id/reviews` | reviews for a PR, each with its findings — the PR page's Agent runs tab |
| `DELETE /reviews/:id` | delete one review |
| `POST /findings/:id/{accept,dismiss,learn,reply}` | act on a finding (one route per `FindingActionKind`) |

## agents — `modules/agents`

CRUD at `/agents`, plus `/agents/:id/versions`, `/agents/:id/skills`, and model
discovery at `/agents/:id/models` and `/providers/:id/models`.

## polling / repo-intel

`POST /repos/:id/poll` triggers a poll cycle; `modules/repo-intel` owns the
indexer's status/resync routes.

## Conventions worth knowing

- Response shapes are Zod contracts from `@devdigest/shared` (snake_case on the
  wire, camelCase in the DB layer — see the root `CLAUDE.md` naming table).
- List endpoints compute rollups on read (one `IN`-query + JS grouping), not via
  denormalised columns — cheap at this size and impossible to leave stale.
- Handlers stay thin: SQL lives in `repository/`, pure derivations in `status.ts`
  / `helpers.ts`, so they unit-test without a database.
