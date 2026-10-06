# Implementation Plan — Project Context amendment (2026-10-06)

Spec: [project-context.md](project-context.md) (approved, re-approved 2026-10-06) · Base plan: [project-context.plan.md](project-context.plan.md) (implemented, not re-planned) · Execution mode: **single-agent** (T1 → T7, then tests and review gates once)

## Goal & Scope
Only the new and amended items of the 2026-10-06 amendment:
- New: AC-44..AC-62, NFR-8..NFR-10.
- Amended: AC-7, AC-18, AC-23, AC-24, D2, D9, D16..D21.

## Assumptions
- [T2] An entry without `group` renders flat, before any grouped headings, with no heading of its own ("renders as today", spec §7).
- [T2] reviewer-core stable-sorts grouped entries into specs, docs, insights as a safety net, even though the server already sends them in that order.
- [T3] The group comes from the existing `rootTypeOf` (`project-context/helpers.ts:25`), fallback `docs`. A stable sort by group runs after `dedupCandidates` and before `applyBudget`, keeping agent-then-skill order inside each group (AC-55).
- [T3] Missing and unreadable docs also carry `root_type` (derived from the path).
- [T4] The reindex route takes no body; any validation uses local `safeParse` (as in `routes.ts:19`).
- [T4] AC-45 uses an in-memory single-flight map keyed `${workspaceId}:${repoId}`; `JobRunner` has no active-job query (`platform/jobs.ts:49-101`).
- [T5] The poll limit is a client constant (e.g. 40 polls × 1500 ms). "Finished" = `lastIndexedSha` or `updatedAt` advances (`client/src/lib/hooks/repo-intel.ts:15-38`). A no-op resync still bumps `updated_at` via `touchIndexState` (`server/src/modules/repo-intel/repository.ts:323-328`), so a successful no-op is detected as finished.
- [T5] Download builds a Blob + anchor using only the basename (`<basename>.md`, E15).

## Recommendations
- AC-45 dedupe: add `enqueueResync(workspaceId, repoId)` to the `container.repoIntel` facade with the single-flight map, and call it from the new route — this avoids importing `RESYNC_JOB_KIND` into `project-context`. Set the map entry before any await, clear it when `done` settles, attach `.catch` to `done` (`server/INSIGHTS.md:10`, `jobs.ts:24-28`). Limit: dedupes only reindex-initiated jobs, not the existing `/repos/:id/resync` (left unchanged on purpose). (AC-44, AC-45)
- NFR-8 test: prove the 202 returns before the job body runs, using a mock `jobs.enqueue` whose `done` never resolves.
- Keep SERIALIZES AS grouping in one pure helper in `components/context-doc-picker/helpers.ts`, shared by the agent and skill tabs. (AC-59..62)

## Modules affected
| Module | Why | AC-IDs |
|---|---|---|
| shared (both copies) | `SpecDetail.root_type` nullish | AC-27, AC-57 |
| reviewer-core | grouped headings in `assemblePrompt` | AC-18, AC-23, AC-54, AC-56, NFR-9 |
| server | group ordering in the resolver, `root_type` in `specs_detail`, reindex route + facade, `group` passed to the engine | AC-7, AC-18, AC-24, AC-44..47, AC-55, AC-57, NFR-8 |
| client | toolbar, Download, disabled Edit, grouped SERIALIZES AS, TraceBody fallback | AC-31, AC-40, AC-48..53, AC-58..62, NFR-10 |
| e2e, mcp | not touched | — |

## Constraints & conventions
- Shared copies are duplicated and can drift: edit both, compare with `diff` (root `CLAUDE.md`, AC-27).
- No migration or schema change (spec §7); do not touch `server/src/db/migrations/` or lock files.
- Onion: `project-context` must not import `repo-intel`; reach the facade through the container (D12). Skill: `onion-architecture`.
- New trace fields must be `.nullish()` — `getRunTrace` casts without parsing (`server/INSIGHTS.md:21`).
- Zod body/querystring failures answer 422; use local `safeParse` where 400 is promised.
- reviewer-core stays pure (no I/O); optional prompt slots get no fallback logic (`reviewer-core/CLAUDE.md`).
- Client: UI from `@devdigest/ui` only, next-intl copy (`messages/en/projectContext.json`), CSS variables (`client/CLAUDE.md`). Skill: `frontend-ui-architecture`.

## Relevant INSIGHTS.md notes
- server `:10` single-flight with the in-flight Map set before any await · `:21` `run_traces` read with a bare cast → `.nullish()` · `:39` poll the `run_traces` row before `GET /runs/:id/trace` in tests · `:41` `platform/container.ts` must not import `settings/feature-models`.
- reviewer-core and client INSIGHTS were not opened by the planner: each implementer reads its module's INSIGHTS.md via `engineering-insights` first.

## Plan tasks
| # | Task | Module | AC-IDs | Skill(s) | Depends on |
|---|---|---|---|---|---|
| T1 | Add `root_type: ContextDocRoot.nullish()` to `SpecDetail`, identically in both shared copies (locate `SpecDetail` with grep). Verify with `diff`. | shared | AC-27, AC-57 | `zod`, `typescript-expert` | — |
| T2 | `assemblePrompt`: `specs` entries gain optional `group: 'specs'\|'docs'\|'insights'`. Render `### Specifications / ### Docs / ### Insights` under the single `## Project context`, in that order, empty groups omitted, headings from constants only. No `specs`, or none grouped → exactly as today. Tests in `reviewer-core/test/prompt.test.ts`: order, empty group, flat fallback, heading imitation in doc text, baseline-equal prompt (AC-23). | reviewer-core | AC-18, AC-23, AC-54, AC-56, NFR-9 | `typescript-expert` | — |
| T3 | Resolver: after `dedupCandidates`, stable-sort by group (`rootTypeOf ?? 'docs'`). `applyBudget` emits `root_type` on every `specs_detail` entry and `group` on every `texts` entry; update `BudgetResult` and `ResolvedProjectContext`. `run-executor.ts` passes `group` through (specs at `:266-267`); failure traces unchanged (`:564`). Unit tests: ordering across agent and skill docs, a doc under several roots (E16), over_budget in grouped order (E19). The `*.it.test.ts` prompt test asserts the headings in `trace.prompt_assembly.specs` (poll `run_traces`). | server | AC-18, AC-24, AC-55, AC-57 | `onion-architecture`, `typescript-expert` | T1, T2 |
| T4 | `enqueueResync(workspaceId, repoId)` on the `RepoIntel` facade and `RepoIntelService`: single-flight map set before any await, `jobs.enqueue(RESYNC_JOB_KIND)`, returns `{jobId}` or a degraded result without throwing. `POST /repos/:repoId/context/reindex` in `project-context/routes.ts`: check the repo is in the caller's workspace first (404 → AC-46, nothing enqueued), then 202 `{status:'accepted', jobId}` or `{status:'accepted', degraded:true, reason}`; no LLM call, does not wait for the job. Tests: 202 body, dedupe returns the same id, 404 enqueues nothing, enqueue throw → degraded, response before job completes. Update the route-list comment in `routes.ts`. | server | AC-7, AC-44, AC-45, AC-46, AC-47, NFR-8 | `onion-architecture`, `fastify-best-practices`, `zod` | — |
| T5 | Page toolbar in `ContextView` (extract `_components/Toolbar` if it grows). `useReindexContext` hook in `lib/hooks/project-context.ts`, reusing `useRepoIntelStatus(poll)` for completion plus the poll-limit constant. Reindex disabled with a spinner while running (label unchanged, `aria-busy`); on finish refetch the doc list; on request failure, degraded response or poll limit → error toast, Reindex re-enabled, list kept. Download builds `<basename>.md` from fetched content; disabled when no doc is selected or content is loading/failed. Disabled Edit tab next to Preview with `aria-disabled` and tooltip "Docs are edited in the repo". Copy keys in `projectContext.json`. RTL tests per state; update `ContextView.test.tsx` for AC-31. | client | AC-31, AC-48..53, NFR-10 | `frontend-ui-architecture`, `react-best-practices`, `react-testing-library`, `next-best-practices` | T4 |
| T6 | Grouped SERIALIZES AS: pure helper in `components/context-doc-picker/helpers.ts` grouping attachments by `root_type`, excluding `missing`, with per-group subtotals and order numbers, hiding empty groups. `SerializesAs` component used by the agent and skill `ContextTab`, replacing the `skillTab.serializes` note; shows that skill docs follow within each group, updates live from picker state, hidden when nothing is attached. Copy + RTL tests. | client | AC-40, AC-59..62 | `frontend-ui-architecture`, `react-best-practices`, `react-testing-library` | T1 |
| T7 | `TraceBody`: when `specs_detail` entries have `root_type`, group the Specs-read row by it; without it, render as today. Old-fixture RTL test in `RunTraceDrawer.test.tsx`. | client | AC-58 | `react-testing-library`, `frontend-ui-architecture` | T1 |

## AC coverage
| AC-ID | Tasks | Verified by |
|---|---|---|
| AC-7, AC-44..47, NFR-8 | T4 | `pnpm --dir server test` |
| AC-18, AC-23, AC-54, AC-56, NFR-9 | T2, T3 | `pnpm --dir reviewer-core test`, `pnpm --dir server test` |
| AC-24, AC-55, AC-57 | T1, T3 | `pnpm --dir server test`, `pnpm --dir server exec vitest run .it.test` |
| AC-27 | T1 | `diff` of both shared copies + both typechecks |
| AC-31, AC-48..53, NFR-10 | T5 | `pnpm --dir client test` |
| AC-40, AC-59..62 | T6 | `pnpm --dir client test` |
| AC-58 | T7 | `pnpm --dir client test` |

## Test plan
- `pnpm --dir reviewer-core test` · `pnpm --dir reviewer-core typecheck`
- `pnpm --dir server test` · `pnpm --dir server typecheck` · `pnpm --dir server arch` · `pnpm --dir server exec vitest run .it.test` (Docker)
- `pnpm --dir client test` · `pnpm --dir client typecheck`
- `diff server/src/vendor/shared/contracts/<file> client/src/vendor/shared/contracts/<file>`
- Scoped `vitest related …` while working; full suites once at the end via `test-runner`.

## Out of scope
Spec authoring; architecture and security review (separate agents); re-planning the base feature; e2e flows (optional per M7); mcp; serialized-context download; a persisted "last indexed" timestamp; changing the existing `/repos/:id/resync` route.

## Risks
- The single-flight map is in-memory and per-process: it does not dedupe against `/repos/:id/resync` or across server instances.
- The prompt layout change shifts token counts slightly; headings don't count against caps (NFR-9), but existing `prompt.test.ts` equality checks may need updates.
- `SpecDetail` location is unconfirmed: locate with grep in T1.

## Execution groups (if multi-agent)
- A (first): T1.
- Then in parallel: B = T2 (`reviewer-core/src/prompt.ts` + test); C = T4 (`project-context/routes.ts`, `repo-intel`, `platform/container.ts`); D = T6 + T7 (`components/context-doc-picker`, both ContextTabs, TraceBody).
- Then T3 (after T1, T2) and T5 (after T4). C and T3 both touch `project-context/`; run them sequentially unless T4 stays out of `service.ts`.
- Single-agent order: T1 → T2 → T3 → T4 → T5 → T6 → T7, then tests and review gates once.
