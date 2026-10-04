# Implementation Plan — PR Why + Risk Brief

Spec: [pr-brief.md](pr-brief.md) (approved) · Execution mode: **multi-agent** (G1 → G2 ∥ G3 → T12)

## Goal & Scope
Add the PR Brief: server module `modules/brief/` with `GET` and `POST /pulls/:id/brief`, a new `project-context` method, a redefined `PrBrief` in both shared copies, and a client Overview card with click-through to `?tab=diff&file=`. In scope: AC-1..AC-30 and NFR-1..NFR-5 of `specs/pr-brief.md`.

## Requirements check
| AC-ID | Status | Note / evidence |
|---|---|---|
| AC-1, 2, 4..16, 18, 20 | Clear | Routes are registered through a static registry (`server/src/modules/index.ts`, used at `app.ts:18,166`). Thunk + service pattern: `modules/onboarding/routes.ts:24-28`. Container wiring pattern: `platform/container.ts:158`. |
| AC-3 | Clear, with a caveat | `IdParams` gives 422 for a non-uuid id, not 404 (`server/INSIGHTS.md:26`). The test must use a well-formed uuid that does not exist. |
| AC-17 | Clear | Single-flight pattern from `server/INSIGHTS.md:10`: synchronous check-and-set in a `Map` keyed `${workspaceId}:${prId}`, set before any `await`. The service must be a container singleton. |
| AC-19 | Clear | Prompt-side delimiting is unit-testable. Client side renders plain text only (no `dangerouslySetInnerHTML`). |
| AC-21..25, 29, 30 | Clear | |
| AC-26..28 | Clear | `page.tsx` handles `?tab` at lines 60-68. `DiffTab` and `DiffViewer` need a new `focusFile` prop. `FileCard` open state is internal (`FileCard.tsx:87`), so it needs an `openSignal` or controlled prop. |
| NFR-1..5 | Clear | NFR-4: wrap the stored-JSON read in `safeParse` and treat a failure as no brief. |

## Assumptions (accepted)
1. `?file=` stays in the URL; the highlight is one-shot per `file` value.
2. Blast files come from `BlastService.getBlast` changed-symbol and caller paths only.
3. `MissingInput` includes `'degraded_blast'`; `blast` means blast failed or has no data.
4. The `agent_runs` row mirrors `reviews/intent-loader.ts:63`.

## Recommendations
- Use the onboarding service shape (`modules/onboarding/{routes,service,repository,types}.ts`) as the template for `brief/`. (AC-4, 17, NFR-5)
- Put the pure parts in `brief/helpers.ts` (hunk-range parsing, budget trimming, post-validation, path normalisation) so they unit-test without a DB (`server/INSIGHTS.md:24`). (AC-5..7, 9..12)
- Declare row shapes structurally in `helpers.ts`; do not import from `repository.ts` (`server/INSIGHTS.md:18`, `no-circular`).
- New `agent_runs` rows with `agentId: null` can leak into existing readers; they filter `isNotNull(agentId)` (`server/INSIGHTS.md:33`). Add a regression assertion in the `.it.test.ts`. (AC-8)
- Use `mutateAsync` plus a `useRef` click-time guard on Generate and Refresh (`client/INSIGHTS.md:17,19`). (AC-22)
- Do not use `IconBtn` for focus items (no `disabled` prop, poor accessible name; `client/INSIGHTS.md:18,23`). Use `<button>` or `Button` with an explicit `aria-label`. (AC-30)
- An e2e flow is optional and deferred: the e2e stack has no LLM.

## Modules affected
| Module | Why | AC-IDs |
|---|---|---|
| `server` | `modules/brief/`, `project-context` method, container wiring, shared contract | AC-1..20, NFR-1..5 |
| `client` | shared contract copy, hooks, PR Brief card, deep link in `DiffTab` and `diff-viewer`, `brief.json` | AC-21..30 |
| `reviewer-core`, `mcp`, `e2e` | not touched | none |

## Constraints & conventions
- No migration: `pr_brief` already exists. Do not touch `server/src/db/migrations/` or lock files.
- `diff` both `contracts/brief.ts` copies before editing, then edit both.
- Server module layout: `routes · service · helpers · constants · repository`.
- Resolve container services lazily per request, and validate before `getContext` (`server/INSIGHTS.md:40`).
- Resolve the model in the route and pass a thunk (`server/INSIGHTS.md:41`).
- `maxRetries: 0` is honoured end to end (`server/INSIGHTS.md:29`).
- Client: UI only from `@devdigest/ui`; CSS variables, no hard-coded colours; copy through next-intl; colocate under `_components/<Name>/` with `index.ts` and `styles.ts` exporting `s`; format by hand, no prettier (`client/INSIGHTS.md:22`).
- `Severity` from `@devdigest/ui` has four members, the wire enum three (`client/INSIGHTS.md:26`): key the severity mapping off the payload type.
- next-intl messages must not contain unpaired `<…>` (`client/INSIGHTS.md:20`).
- Run `pnpm --dir client typecheck`, not `build`, while `next dev` is running (`client/INSIGHTS.md:13`).

## Relevant INSIGHTS.md notes
- server `:10` single-flight · `:18` helpers purity / `no-circular` · `:26` `IdParams` 422 · `:27` blast `no_data`, `pr_files` only filled once the PR is opened · `:28` `readDoc` is the safe read; the project-context method must reuse it · `:29` `maxRetries: 0` · `:33-34` null-agent `agent_runs` rows; tests calling `/pulls/:id/review` need an `openrouter` mock if the brief path can write rows.
- client `:17` `mutateAsync` after unmount · `:19` click-time ref guard for paid actions · `:18` `IconBtn` limits.

## Plan tasks
| # | Task | Module | AC-IDs | Skill(s) | Depends on |
|---|---|---|---|---|---|
| T0 | Read both INSIGHTS.md files. `diff` the two `contracts/brief.ts` copies. | server, client | supports T1 | `engineering-insights` | — |
| T1 | Redefine `PrBrief` in both shared copies: `ReviewFocusItem`, `MissingInput`, model-facing schema `{summary, risks, review_focus}`, wire type `PrBrief & {stale}`. Keep `PrHistory`. Update the `client/src/lib/types.ts:35` re-export if needed. | server, client | AC-8, NFR-3, NFR-4 | `zod`, `typescript-expert` | T0 |
| T2 | project-context method: deduped union of docs attached to enabled agents of the repo, via `readDoc` and existing caps, fail-soft; repository query. Unit test + `.it.test.ts`. | server | AC-20 | `onion-architecture`, `drizzle-orm-patterns` | — |
| T3 | `brief/helpers.ts` (pure) + `constants.ts`: `@@` new-side range parser, `classifyFile` stats lines, per-section token caps, trim order (specs → least-churn files → description tail) with `[truncated]`, prompt builder with untrusted-data delimiting and no hunk bodies, post-validation (risks on PR ∪ blast files, focus on PR files only, bad `line` → null, dropped counts). Unit tests. | server | AC-5, 6, 7, 9, 10, 11, 12, 19, NFR-1, NFR-3 | `onion-architecture`, `typescript-expert`, `zod` | T1 |
| T4 | `brief/repository.ts` (read/upsert `pr_brief` with `safeParse`, `createAgentRun`) and `brief/service.ts`: single-flight, input assembly (intent, `getPrFiles`, `BlastService.getBlast`, `resolveLinkedIssueSignal`, T2 specs), `missing_inputs` + `degraded_blast`, one `completeStructured` with `maxRetries: 0`, post-validate, store, `agent_runs` row, one log line. Errors leave the cache untouched. Model is a thunk. | server | AC-1, 2, 4, 8, 13, 14, 15, 16, 17, NFR-2, NFR-5 | `onion-architecture`, `drizzle-orm-patterns`, `zod` | T1, T2, T3 |
| T5 | `brief/routes.ts`: `GET`/`POST /pulls/:id/brief`, 404 for unknown PR, `POST` rate limit `{max:10, timeWindow:'1 minute'}`, thunk via `resolveFeatureModel(…, 'risk_brief')`. Register in `modules/index.ts`. Container getter `briefService` (singleton). | server | AC-1, 2, 3, 4, 18 | `fastify-best-practices`, `onion-architecture` | T4 |
| T6 | Server tests: service unit tests with a recording mock LLM (call count 1, no GitHub call on cached `GET`, error leaves cache unchanged, concurrent `POST` → one call). `brief.it.test.ts` for AC-1, 2, 3, 8, 16, 17, 18. Name each `it('AC-n: …')`. | server | AC-1..4, 8, 13..18, NFR-2, NFR-4, NFR-5 | `onion-architecture`, `fastify-best-practices` | T5 |
| T7 | Client hooks `lib/hooks/brief.ts`: `useBrief` (GET), `useGenerateBrief` (POST, `mutateAsync`, invalidate). | client | supports T8 | `react-best-practices`, `typescript-expert` | T1 |
| T8 | `OverviewTab/_components/PrBrief/` (`PrBrief.tsx`, `index.ts`, `styles.ts`, `constants.ts`, `helpers.ts`): no-brief, generating (skeleton), ready, stale, no-risks, no-focus, error states; risks with severity colour + label; focus items as focusable buttons that `router.push` `?tab=diff&file=`; non-clickable risk files; missing-input chips; cost chip; plain text; click-time ref guard. Mount in `OverviewTab` with `IntentCard` and `BlastRadius`. | client | AC-21..26, 29, 30 | `frontend-ui-architecture`, `react-best-practices`, `next-best-practices` | T7 |
| T9 | New keys in `client/messages/en/brief.json` (summary, risk areas, review focus, generate, refresh, stale, error/retry, missing-input labels, cost, empty focus). Fix the misleading `unavailableHint`. | client | AC-25, 30 | `next-best-practices` | — |
| T10 | Read `?file=` in `page.tsx` → `DiffTab` → `DiffViewer` (prop). `DiffViewer` finds the file in `ordered`, expands its group, `FileCard` accepts a controlled open state/signal, then `scrollIntoView` + highlight. Unmatched file renders normally. Do not edit `src/vendor/ui/`. | client | AC-27, 28 | `frontend-ui-architecture`, `react-best-practices` | — |
| T11 | Client tests (RTL): `PrBrief.test.tsx` covering all states with AC-n names, focus-click `router.push` assertion, `DiffViewer` `?file=` match/no-match. | client | AC-21..30 | `react-testing-library` | T8, T9, T10 |
| T12 | Final gate: typecheck, arch, tests. Update INSIGHTS.md only if something substantial came up. | all | supports T6, T11 | `engineering-insights` | T6, T11 |

## AC coverage
| AC-ID | Tasks | Verified by |
|---|---|---|
| AC-1, 2, 3 | T4, T5, T6 | `.it.test` |
| AC-4 | T4, T5, T6 | `pnpm --dir server test` (recording mock), `.it.test` |
| AC-5, 6, 7 | T3, T4 | `pnpm --dir server test` |
| AC-8 | T1, T4, T6 | `.it.test` |
| AC-9..12 | T3 | `pnpm --dir server test` |
| AC-13..16 | T4, T6 | `pnpm --dir server test` |
| AC-17 | T4, T6 | `pnpm --dir server test`, `.it.test` |
| AC-18 | T5, T6 | `.it.test` |
| AC-19 | T3, T8 | server + client tests |
| AC-20 | T2 | `pnpm --dir server test`, `.it.test` |
| AC-21..25, 29, 30 | T8, T9, T11 | `pnpm --dir client test` |
| AC-26, 27, 28 | T8, T10, T11 | `pnpm --dir client test` |
| NFR-1 | T3 | `pnpm --dir server test` |
| NFR-2 | T4, T6 | `pnpm --dir server test` |
| NFR-3 | T1, T3 | `pnpm --dir server test` |
| NFR-4 | T1, T4 | `pnpm --dir server test` (bad stored JSON → no brief) |
| NFR-5 | T4, T6 | `pnpm --dir server test` (log spy) |
| Contract | T1 | `diff` of both `brief.ts` copies, then both typechecks |

## Test plan
- `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` — identical after T1.
- `pnpm --dir server typecheck` · `pnpm --dir server arch` · `pnpm --dir server test` · `pnpm --dir server exec vitest run .it.test` (Docker).
- `pnpm --dir client typecheck` · `pnpm --dir client test`.
- During implementation use only scoped runs (`vitest related … --exclude '**/*.it.test.ts'`); full suites run once via `test-runner`.

## Out of scope
Verdict banner/score, `history`, expandable risk text, Prior PRs, auto-deriving intent, auto-regeneration, reading hunk bodies (spec §14); optional e2e flow (deferred).

## Risks
- Cross-module imports from `brief/` into the `reviews` repository and `BlastService` might trip dependency-cruiser; check how `blast`/`onboarding` consume them, narrow with a port if needed. (T4)
- The 8,000 cap is exact only if every section is counted with `container.tokenizer.count`; character heuristics break AC-6.
- `FileCard` open state is internal; T10 touches shared diff-viewer code used by other tabs — keep it additive, optional props only.
- The shared copies may drift: T0's `diff` is mandatory.
- `completeStructured` provider errors under `maxRetries: 0` must map to a non-500-leaking message (AC-16, AC-23).

## Execution groups (multi-agent)
- **G1** (sequential, first): T0, T1 — contract in both copies.
- **G2** (server): T2–T6. Files: `server/src/modules/{brief,project-context}`, `server/src/modules/index.ts`, `server/src/platform/container.ts`, `server/test/`.
- **G3** (client): T7–T11. Files: `client/src/app/repos/[repoId]/pulls/[number]/**`, `client/src/components/diff-viewer/**`, `client/src/lib/hooks/brief.ts`, `client/messages/en/brief.json`.
- G2 ∥ G3 after G1 (no shared files), then T12.
