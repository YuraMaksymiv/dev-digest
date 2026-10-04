# Implementation Plan — Onboarding Generator

Spec: [onboarding-generator.md](onboarding-generator.md) (approved) · Execution mode: multi-agent.

## Goal & Scope

Per-repo Onboarding Tour: `GET /repos/:id/onboarding`, `POST /repos/:id/onboarding/generate` (exactly one structured LLM call, no auto-retry), a deterministic skeleton, and a client page plus sidebar item. In scope: AC-1..AC-48, NFR-1..NFR-8. Modules: `server/`, `client/`, both `@devdigest/shared` copies, one small `reviewer-core/` + server adapter change, `e2e/`. Tests are written later by `test-writer`; this plan only lists the level each AC needs.

## Requirements check

All 48 ACs and 8 NFRs are Clear or Clear with a stated assumption.

| AC-ID | Status | Note / evidence |
|---|---|---|
| AC-17, NFR-1, AC-24, NFR-4 | Infeasible as-is (fix in T3) | `req.maxRetries` only controls the reprompt loop. OpenRouter (`reviewer-core/src/llm/openrouter.ts:55,61,68`) builds the SDK client with `maxRetries: opts.maxRetries ?? 2` (HTTP-level retries) and ignores `req.timeoutMs` (90 s default, `:54`). OpenAI (`server/src/adapters/llm/openai.ts:51,97-110`): `withRetry` defaults to 3 retries (`platform/resilience.ts:47`) plus SDK default 2. Anthropic (`adapters/llm/anthropic.ts:45,100-119`): same. `withTimeout` only races the promise (`resilience.ts:13-24`), it does not abort the HTTP request. |
| §8 "reviewer-core unchanged" | Conflicts with AC-17 | T3 edits `reviewer-core/src/llm/openrouter.ts`. |
| AC-47 / D13 | Clear, mechanism chosen | See T13. |
| AC-14, AC-16 | Clear, assumption | Facade `isJunkPath` (`repo-intel/service.ts:713-733`) does not cover generated/vendor/lock paths; onboarding `helpers.ts` adds its own extra exclusion list. |
| AC-17 / AC-26 | Clear, assumption | "Usable index" = status not `degraded`/`failed`; `partial` counts as usable (server INSIGHTS 2026-10-01). |
| AC-7 | Clear, assumption | `stale` is false when `generated_sha` is null or no tour is stored. |
| AC-19 | Clear | "Indexed file list" comes from the new facade method (T4), returning every ranked file. |
| AC-27 | Clear | FK has `ON DELETE CASCADE`; upsert must check repo existence in the same statement/transaction. |
| AC-28, AC-46 | Clear | `Markdown` primitive and `mermaid-diagram` exist; implementer verifies `Markdown` blocks raw HTML. |
| All other ACs / NFRs | Clear | |

## Decisions on planner questions

1. **reviewer-core change (Q1)** — accepted: T3 edits `openrouter.ts` and the OpenAI/Anthropic adapters; spec §8 is amended accordingly.
2. **Nav item (Q2)** — app-side idempotent extension through the `@devdigest/ui` barrel; no edits under `client/src/vendor/ui/`.
3. **e2e seed (Q3)** — implementer asserts whichever state the seed actually produces.
4. **Auth/rate limit (Q4)** — existing workspace scoping (`safeParse` → `getContext`), single-flight only, i18n only in `onboarding.json`.

## Recommendations

- T3 minimal: when `req.maxRetries === 0`, pass per-request SDK options `{ maxRetries: 0, timeout: req.timeoutMs }` as the second argument of `create`; `withRetry(..., { retries: 0 })` in OpenAI/Anthropic adapters; `OpenRouterProvider` honours `req.timeoutMs`. Callers that omit `maxRetries` are unchanged.
- Reuse the conventions precedent for the service shape (`modules/conventions/service.ts:63-109`) and `readDoc` in `modules/project-context/service.ts` for safe clone reads.
- Facade method `getRankedFiles(repoId, limit?): Promise<{path, rank}[]>` wrapping `repo.getRankedPaths` (`repo-intel/service.ts:647,668`), `repoIntelEnabled` gate, `pipeline/` untouched.
- `llm_calls` = `StructuredResult.attempts`, persisted; with `maxRetries: 0` it is always 1.
- Share link (AC-34) and score badge are cosmetic and can be deferred if the schedule slips.

## Modules affected

| Module | Why | AC-IDs |
|---|---|---|
| `server/src/vendor/shared` + `client/src/vendor/shared` | New contracts `OnboardingTour`, `OnboardingResponse` (diff copies first) | AC-1, AC-6 |
| `server/` db | Seven nullable columns on `onboarding`, generated migration | AC-21, NFR-8 |
| `server/` repo-intel | New read-only facade method; pipeline untouched | AC-12, AC-14, AC-19 |
| `server/` onboarding module (new) | Facts, ranking, skeleton, LLM, persistence, routes, prompt | AC-1..27, NFR-1..8 |
| `server/` adapters + `reviewer-core/` | No-retry and timeout honouring | AC-17, AC-24, NFR-1, NFR-4 |
| `client/` | Page, hook, messages, nav, `activeKeyFor` | AC-28..48 |
| `e2e/` | New skeleton/empty-state flow | AC-42, AC-47 |
| `mcp/` | Not touched | |

## Constraints & conventions

- Contracts and schema first and sequential. Both shared copies edited and diffed. Migration generated with `pnpm --dir server db:generate`, never hand-edited, all columns nullable; the generate run must contain only additions to `onboarding`.
- Onion rules: `helpers.ts` pure, no row-type imports from `repository.ts` (declare structurally); service goes through repository; service wired in `platform/container.ts` getter (like `projectContextService`); routes registered in `server/src/modules/index.ts`; run `pnpm --dir server arch`.
- Routes: `safeParse` first, then `getContext`, lazy container service per request; non-uuid id → 422; wire DTOs snake_case.
- Clone reads: realpath-relative check, reject `.git` segments, `O_NOFOLLOW`, lstat vs fstat (follow `readDoc`).
- LLM tests use a mock `openrouter` provider; tests named `it('AC-<n>: …')`.
- Client: UI from `@devdigest/ui` only, no hard-coded colours, all copy via next-intl (no unpaired `<`), colocated `_components/<Name>/` with `index.ts`, `styles.ts` exporting `s`. Double-click guard via `useRef`; `mutateAsync` when a follow-up depends on the result; `IconBtn` has no `disabled` (use `Button`/handler guard); badge-wrapping buttons need `aria-label`.
- Do not run `pnpm --dir client build` while `next dev` is up.

## Relevant INSIGHTS.md notes

- server: rank is PageRank-only; `pr_files` filled only when a PR is first opened → hotness undercounts (accepted, spec D3).
- server: `getIndexState` flags only `degraded`/`failed`, never `partial`.
- server: 422 vs 404 for invalid ids; AC-8 means 404 for a well-formed unknown uuid.
- client: `/onboarding` is the add-repo route and collides with `activeKeyFor` (`client/src/components/app-shell/helpers.ts:29`); `06-onboarding.flow.json` must keep passing.
- e2e: DOM spelling and accessible names, no hover primitive; flows assume only the seeded repo.
- reviewer-core `INSIGHTS.md` must be read by the implementer before T3.

## Plan tasks

`engineering-insights` applies to every task as a pre-step for its module.

**G1 (sequential, first): contracts and schema.** Files: `server/src/vendor/shared/**`, `client/src/vendor/shared/**`, `server/src/db/schema/context.ts`, `server/src/db/migrations/` (generated only).

| # | Task | Module | AC-IDs | Skill(s) | Depends on |
|---|---|---|---|---|---|
| T1 | `diff` the two shared copies. Replace `OnboardingLink`/`OnboardingSection`/`Onboarding` (`knowledge.ts:28-47`) with `OnboardingTour` and `OnboardingResponse` in both copies (update `index.ts` exports; no other consumers exist — verify with grep). Server-internal LLM-output schema lives in the server module (T7). | server, client | AC-1, AC-2, AC-6 | `zod`, `typescript-expert` | — |
| T2 | Add nullable `model text`, `tokens_in int`, `tokens_out int`, `cost_usd double precision`, `llm_calls int`, `duration_ms int`, `generated_sha text` to `onboarding` (`schema/context.ts:120-126`); run `pnpm --dir server db:generate` once. | server | AC-21, NFR-8 | `drizzle-orm-patterns`, `postgresql-table-design` | — |

**G2 (parallel after G1).** G2a files: `reviewer-core/src/llm/openrouter.ts`, `server/src/adapters/llm/{openai,anthropic}.ts`, related tests. G2b files: `server/src/modules/repo-intel/{types,service}.ts` (RepoIntel test doubles are inline casts; `mocks.ts` does not implement it).

| # | Task | Module | AC-IDs | Skill(s) | Depends on |
|---|---|---|---|---|---|
| T3 | When `req.maxRetries === 0`: single HTTP request (per-request SDK `{maxRetries: 0, timeout}`, `withRetry` retries 0); `OpenRouterProvider` honours `req.timeoutMs`. Constructor default `maxRetries ?? 2` stays; the per-request override is the guard. Default behaviour unchanged when `maxRetries` omitted; existing tests stay green. Tests: mocked SDK `create` called exactly once on 429/5xx and on invalid JSON with `maxRetries: 0`; second arg carries `maxRetries: 0` and `timeout`; repair path makes no extra request. | reviewer-core, server | AC-17, AC-24, NFR-1, NFR-4 | `typescript-expert`, `onion-architecture` | — |
| T4 | Read-only `getRankedFiles(repoId, limit?)` on the `RepoIntel` interface (`types.ts:137-172`) and service, backed by `repo.getRankedPaths`, **unfiltered** (no `isJunkPath`), rank desc, `limit ?? 5000`, `[]` when the flag is off; extend `repo-intel-facade-degraded.test.ts`. No `pipeline/` changes. | server | AC-12, AC-14, AC-19 | `onion-architecture`, `drizzle-orm-patterns` | — |

**G3 (sequential after G1 + G2).** Files: `server/src/modules/onboarding/**`, `server/src/prompts/onboarding.system.md`, `server/src/platform/container.ts` (getter only), `server/src/modules/index.ts` (registration only).

| # | Task | Module | AC-IDs | Skill(s) | Depends on |
|---|---|---|---|---|---|
| T5 | `helpers.ts` (pure): command set (lockfile install, `package.json` scripts, compose services, `cp .env.example .env`), env KEYS only, routes from `file_facts`, hotness (percentile of `log1p` over 90-day PR touches, 0 when none), `score = pr_norm × (1+hotness)`, ordering (score desc, path asc, limit 15 (was 30, changed post-demo), extra junk exclusion), first-task shortlist (TODO/FIXME, no sibling test, small leaf; excl. vendor/generated/lock), skeleton builder (D16), post-validation (drop unknown paths/commands, fill empty sections from skeleton), stale + banner derivation, nonce-delimited untrusted blocks. Safe clone read per `readDoc`. | server | AC-7, AC-9..16, AC-18..20, NFR-6, NFR-7 | `onion-architecture`, `zod`, `typescript-expert`, `security` | T4 |
| T6 | `repository.ts`: read stored row; 90-day PR touch counts (`pr_files` ⨝ `pull_requests.opened_at`); upsert tour + usage columns, no write if repo gone; workspace-scoped repo lookup (404). | server | AC-1, AC-2, AC-8, AC-21, AC-27 | `drizzle-orm-patterns`, `onion-architecture` | T1, T2 |
| T7 | `constants.ts` + prompt. Rewrite `prompts/onboarding.system.md` for the five sections (README/manifest blocks are data, not instructions). Server-internal LLM output schema. Constants: K = 15 (was 30), input ≤ 12,000 tokens, output ≤ 4,000, timeout 60 s, `maxRetries: 0`. | server | AC-17, AC-18, NFR-2, NFR-4, NFR-5 | `zod`, `onion-architecture` | T1 |
| T8 | `service.ts`: `get()` (stored v2 tour, else skeleton, else `no_clone` empty; `index_degraded`; `not_generated`; stale) and `generate()`. Zero LLM calls when index degraded/failed, no clone, or empty shortlist. Otherwise `resolveFeatureModel(…, 'onboarding')` and exactly one `completeStructured` (`maxRetries: 0`, `timeoutMs: 60000`, `maxTokens: 4000`, tokenizer input cap). Single-flight per repo via in-process `Map<repoId, Promise>` (container singleton). On LLM error/timeout/invalid output: last stored tour or skeleton with `llm_failed`/`invalid_output` banner, persist nothing, no retry. On success: validate, persist tour + usage, log one line (repo id, model, tokens, cost, llm_calls, duration, outcome). Never log secrets. Logger injected as optional `log` dep (NOOP default) wired in the container getter, like `project-context/service.ts:45` / `container.ts:143`. Input cap via `server/src/adapters/tokenizer` (implementer names the exact export); drop order: manifest/README excerpts first, then shortlist tail; unit test with an oversized fixture asserts ≤ 12k. Calls `getCriticalPaths` for AC-15. | server | AC-1..8, AC-17, AC-19..27, NFR-1..4, NFR-6, NFR-7 | `onion-architecture`, `fastify-best-practices`, `typescript-expert` | T3..T7 |
| T9 | `routes.ts`: `GET /repos/:id/onboarding`, `POST /repos/:id/onboarding/generate`; `IdParams` + `safeParse`, `getContext`, lazy `app.container.onboardingService`; register in `modules/index.ts`. 404 unknown repo; HTTP 200 with banner on LLM failure. Run `pnpm --dir server arch`. | server | AC-1, AC-3..8, AC-24..26 | `fastify-best-practices`, `onion-architecture`, `zod` | T8 |

**G4 (parallel with G3 after G1; client only).** G4a files: `client/src/app/repos/[repoId]/onboarding-tour/**`, `client/src/lib/hooks/onboarding.ts` (+ barrel), `client/messages/en/onboarding.json`. G4b files: `client/src/components/app-shell/**`.

| # | Task | Module | AC-IDs | Skill(s) | Depends on |
|---|---|---|---|---|---|
| T10 | React Query hooks `useOnboarding(repoId)` and generate mutation; registered in hooks barrel; resync CTA reuses existing `POST /repos/:id/resync` hook. | client | AC-36, AC-38, AC-42, AC-43 | `react-best-practices`, `frontend-ui-architecture`, `typescript-expert` | T1 |
| T11 | Rewrite `messages/en/onboarding.json` for the five sections (headers, TOC, banners, chips, buttons, empty/error states, accessible names); (nothing else reads this namespace; `shell.json` already has the `onboarding-tour` label). | client | AC-35, AC-48 | `next-best-practices`, `frontend-ui-architecture` | — |
| T12 | `page.tsx` + `_components/OnboardingTourView/` and sub-components: Header (chips, Share link), TOC anchors, five collapsible cards (expanded on load, local state), banner, skeleton cards, empty state, error card, numbered reading path with score badge, run-step copy button, Open link `https://github.com/<full_name>/blob/<last_indexed_sha>/<path>` (new tab), first tasks labelled unranked on `source: 'skeleton'`. Markdown without raw HTML; diagram via `mermaid-diagram` with fallback that omits it; cost chip "—" for null; stale chip; "Regenerating…" disables button and keeps content; `useRef` double-click guard; HTTP failure keeps content + error banner with Retry. Styles via CSS variables. | client | AC-28..46, AC-48 | `frontend-ui-architecture`, `react-best-practices`, `next-best-practices`, `mermaid-diagram`, `zod` | T10, T11 |
| T13 | App-shell nav extension (e.g. `components/app-shell/nav-extension.ts`) that idempotently inserts `{ key: "onboarding-tour", label: "Onboarding Tour", icon, href: "/repos/:repoId/onboarding-tour" }` into WORKSPACE between `pulls` and `context` via the `@devdigest/ui` barrel; imported from the app-shell entry. Import it as `import "./nav-extension"` inside `AppShell.tsx`; guard with `NAV.some(g => g.items.some(i => i.key === "onboarding-tour"))`, find WORKSPACE by `section`, splice after `pulls` (HMR/SSR-safe). Fix `activeKeyFor` (`helpers.ts:29`) to `pathname.includes("/onboarding-tour")`. Unit tests: extension idempotence + order; `activeKeyFor` for `/onboarding` and `/onboarding-tour`. No edits under `src/vendor/ui/` (deviates from "extend through the barrel" only in spirit — runtime mutation of the barrel-exported array). | client | AC-47 | `frontend-ui-architecture`, `react-best-practices`, `typescript-expert` | — |

**G5 (after G3 and G4): e2e.**

| # | Task | Module | AC-IDs | Skill(s) | Depends on |
|---|---|---|---|---|---|
| T14 | `e2e/flows/09-onboarding-tour.flow.json`: open `/repos/<seeded>/onboarding-tour`, assert sidebar item + header, assert the empty or "Not generated yet" state per seed. Never click Generate. Re-run `06-onboarding.flow.json`. | e2e | AC-35, AC-41, AC-42, AC-47 | `engineering-insights` | T9, T12, T13 |

## AC coverage

U = unit, IT = server integration (`*.it.test.ts`, Testcontainers, mock `openrouter`), R = route test, RTL = React Testing Library, E = e2e.

| AC-ID | Tasks | Level |
|---|---|---|
| AC-1, AC-2 | T1, T6, T8 | IT |
| AC-3, AC-4, AC-5 | T8, T9 | IT, R |
| AC-6 | T1, T8 | IT, R |
| AC-7 | T5, T8 | U |
| AC-8 | T6, T9 | IT, R |
| AC-9 | T5 | U |
| AC-10, AC-11 | T5 | U (tmp-dir fixtures incl. symlink) |
| AC-12, AC-13, AC-14 | T4, T5 | U |
| AC-15 | T8 | U |
| AC-16 | T5 | U |
| AC-17 | T3, T8 | U, IT |
| AC-18 | T5, T7 | U |
| AC-19, AC-20 | T4, T5, T8 | U |
| AC-21 | T2, T6, T8 | IT |
| AC-22 | T8 | U (logger spy) |
| AC-23 | T8 | U, IT |
| AC-24, AC-25 | T3, T8 | U, IT |
| AC-26 | T8 | U, IT |
| AC-27 | T6 | IT |
| AC-28..AC-34 | T12 | RTL |
| AC-35 | T11, T12 | RTL |
| AC-36 | T10, T12 | RTL |
| AC-37..AC-41 | T12 | RTL |
| AC-42 | T10, T12 | RTL, E |
| AC-43..AC-46 | T12 | RTL |
| AC-47 | T13, T14 | RTL/U, E |
| AC-48 | T11, T12 | RTL |
| NFR-1 | T3, T8 | U, IT |
| NFR-2 | T7, T8 | U |
| NFR-3 | T8, T9 | IT |
| NFR-4 | T3, T8 | U |
| NFR-5 | T5, T7, T12 | U, RTL |
| NFR-6 | T5, T8 | U |
| NFR-7 | T5, T8 | U |
| NFR-8 | T2 | review of `db:generate` output |

## Test plan

- `pnpm --dir server typecheck` + `pnpm --dir server arch` after G1..G3.
- `pnpm --dir server test` — pure rules, route validation, adapter no-retry (T3).
- `pnpm --dir server exec vitest run .it.test` — AC-1..8, AC-21, AC-23..27, NFR-1, NFR-3 (Docker).
- `pnpm --dir reviewer-core test` + `typecheck` — T3 non-regression.
- `pnpm --dir client test` + `typecheck` — AC-28..48, NFR-5; `/showcase` smoke stays green.
- `./scripts/e2e.sh` — AC-47, AC-42, `06-onboarding.flow.json` non-regression.
- `pnpm --dir server db:migrate` manually after T2.
- `diff server/src/vendor/shared/contracts/knowledge.ts client/src/vendor/shared/contracts/knowledge.ts` after T1.

## Out of scope

Public share endpoint, auto-generation, MCP tools, README/tree via GitHub API, git-history churn, persisted collapse state, `src/vendor/ui/` layer-file edits, hand-edited migrations.

## Risks

- Behaviour change in shared LLM adapters (T3) — only the `maxRetries === 0` path changes; grep that other callers don't pass `maxRetries: 0`.
- OpenRouter provider cached per process (`container.ts:199-207`) — per-request SDK options avoid rebuilding it.
- Runtime `NAV` mutation (T13) depends on load order; must be idempotent.
- `pr_files` hotness undercount (accepted, D3).
- `db:generate` must emit only `ADD COLUMN`; otherwise stop and ask.
- Shared copies may already drift — diff first.

## Execution (multi-agent)

G1 → {G2a, G2b, G4a, G4b} in parallel → G3 (T5–T7 may overlap G2a; T8 needs T3) → G5. NFR-3: IT includes a ~5000-file `GET` timing assertion. Each implementer emits a diff digest; then `test-writer` (from ACs) → `test-runner` → `architecture-reviewer` + security review → `plan-verifier`.

## Cross-model review (2026-10-04)

Independent review on a different model (Sonnet) — verdict **ready-with-fixes**, no blockers. All findings folded into the tasks above:
F1 nav-extension import/idempotence (T13) · F2 single-request tests (T3) · F3 no `mocks.ts` RepoIntel (G2b) · F4 no old-contract consumers (T1) · F5 `onboarding.json` not read elsewhere (T11) · F6 injected logger (T8) · F7 tokenizer cap + drop order (T8) · F8 unfiltered `getRankedFiles` (T4) · F9 `activeKeyFor` tests (T13) · F10 T5–T7 may overlap G2a · F11 AC-15 owner + NFR-3 timing · F12 no convention violations.
