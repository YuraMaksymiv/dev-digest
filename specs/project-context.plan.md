# Implementation Plan — Project Context

Spec: [project-context.md](project-context.md) (approved). Accepted 2026-10-03. Execution mode: **multi-agent**.

## User decisions (planning round)
- **Q1 (AC-2/AC-3)**: roots are a constant (`specs`, `docs`, `insights`); AC-3 (configurable setting) deferred. No glob library, no hand-rolled glob matcher — a path qualifies when it ends in `.md` and has a segment equal to a root name.
- **Q2 (AC-43)**: narrow edit to `client/src/vendor/ui/nav.ts` approved — add exactly one WORKSPACE item "Project Context", no `gKey`, nothing else in `vendor/ui/` changes.
- **Minor assumptions accepted**:
  - Footer: `total_files` = matched count; `total_tokens` and per-doc tokens cover returned docs only.
  - `over_budget` entries record the doc's own (capped) token count.
  - Arrow-button reorder in Context tabs is in scope (NFR-7/M5); P2 "not adopted" referred to the Project Context page only.
  - Walk skips `IGNORE_DIRS` (`.git`, `node_modules`, …) and does not follow symlinked directories.
  - File > 64 KB: tokens from the first 64 KB; binary (NUL bytes) → `unreadable`. No `truncated` flag on `ContextDocContent`.
  - Roots/guard rejection at run time → `unreadable`; attachment list marks only vanished files `missing`.
  - `PUT` with `paths: []` clears the repo's attachments.
  - No rate limit on the list route.

## Goal & Scope
Attach repo markdown docs (`specs/`, `docs/`, `insights/`) to agents and skills, per repo. At run time the server resolves them, caps by tokens, and injects them as an UNTRUSTED `## Project context` block; the run drawer shows what was injected and skipped. View-only; tokens via `container.tokenizer`. In scope: AC-1..43 (AC-3 deferred), NFR-1..7.

## Constraints & conventions
- Onion layering (`server/.dependency-cruiser.cjs`): only `repository.ts` touches Drizzle; `helpers.ts` pure (no node builtins, no `db`/`adapters`); `modules/` never imports `adapters/*`; no cycles.
- `reviews` gets the resolver through the Container (port in `modules/project-context/types.ts`, like `repo-intel/types.ts`). Build it from `db`, `git`, `tokenizer`, `config` — not from the whole Container (avoid the `RepoIntelService(this)` cycle pattern).
- Migrations only via `pnpm --dir server db:generate`; add the schema file to the `db/schema.ts` barrel and `schema` object.
- `@devdigest/shared` duplicated: mirror by hand, verify with `diff` (barrel syntax may differ: `.js` suffixes on server).
- Wire DTOs snake_case; Zod schema + type share a PascalCase name.
- Client: UI only from `@devdigest/ui`, CSS variables, next-intl copy, `_components/<Name>/` layout; code shared by two routes lives in `client/src/components/`.
- Don't run `pnpm --dir client build` while `next dev` runs; use typecheck.
- reviewer-core: omitted optional slot drops its section — no fallback logic.

## Relevant INSIGHTS notes
- server: `helpers.ts` must not import row types from its own `repository.ts` — use structural shapes. Lists rendered by UI need explicit `ORDER BY` (`position`). `getRunTrace` casts without parsing → `specs_detail` `.nullish()`. `schema.body/querystring` failures give 422 → routes promising 400 must `safeParse` locally. `completeAgentRun` runs before `saveRunTrace` → executor `.it.test` polls for the trace row. `text(..., {enum})` emits no DDL; use `check()`.
- client: next-intl breaks on unpaired `<…>` (AC-40 copy mentions `<untrusted>` — escape/avoid). `IconBtn` has no `disabled` prop. Use `mutateAsync` when follow-up must survive unmount. Don't run prettier.

## Plan tasks
| # | Task | Module | AC-IDs | Skill(s) | Depends on |
|---|---|---|---|---|---|
| T1 | `contracts/project-context.ts` (`ContextDoc`, `ContextDocList`, `ContextDocContent`, `ContextAttachment`, `ContextAttachmentList`, PUT body, `SpecDetail`), `RunTrace.specs_detail` `.nullish()`, barrels, mirrored client copy. Fixture test in `server/test/contracts.test.ts` incl. old trace without `specs_detail`. | both shared copies | AC-27, NFR-6 | engineering-insights, zod, typescript-expert | — |
| T2 | `db/schema/project-context.ts`: `agent_context_docs`, `skill_context_docs`; cascade FKs (owner, repo); unique `(owner, repo_id, path)`; index `(owner, repo_id, position)`; barrel + `schema` object; `pnpm --dir server db:generate`. | server | AC-11, AC-12, AC-15 | engineering-insights, drizzle-orm-patterns, postgresql-table-design, onion-architecture | T1 |
| T3 | reviewer-core: `specs?: (string \| {source,text})[]`; `wrapUntrusted` sanitizes `source` (`[A-Za-z0-9._/-]`, max 200, else `_`); closing-tag neutralizer `/<\s*\/\s*untrusted\s*>/gi`; plain strings keep `spec-<i>`. Update `PromptParts`, `ReviewInput`, JSDoc. Tests in `reviewer-core/test/prompt.test.ts`. | reviewer-core | AC-18, AC-23, AC-25, AC-26 | engineering-insights, onion-architecture, typescript-expert | — |
| T4 | Pure slice: `constants.ts` (caps 4000/10000/500/64 KB, `ROOTS`, `IGNORE_DIRS`), `types.ts` (resolver port), `helpers.ts` (path validation, root-segment match, `root_type`, truncate-head, budget walk, dedup, token sum, `specs_detail` assembly). Unit tests (`..`, absolute, non-`.md`, outside roots). | server/project-context | AC-1, AC-2, AC-8, AC-17 (dedup), AC-20, AC-21, NFR-4 | engineering-insights, onion-architecture, typescript-expert, zod | T1 |
| T5 | `repository.ts`: attachments get + transactional replace ordered by `position`; `used_by` aggregate (distinct agents, direct or via any skill link); repo/agent/skill workspace lookups. Return contract-shaped types. `*.it.test.ts`. | server/project-context | AC-1 (`used_by`), AC-11..16 | onion-architecture, drizzle-orm-patterns, postgresql-table-design | T2, T4 |
| T6 | `service.ts`: list (clone walk, skip symlinks + IGNORE_DIRS, bounded concurrency ~8, 500 cap, duration log, `not_cloned`); content (guard, realpath containment, 64 KB, 404); attachments get/put; `resolve(agent, skills, repo)` → `{texts[], specs_detail, specs_read}`, fail-soft with logging. Tests with temp dir + symlinks. | server/project-context | AC-1, AC-4..6, AC-8..10, AC-14, AC-16, AC-19..22, NFR-2, NFR-3, NFR-5 | onion-architecture, typescript-expert, zod | T4, T5 |
| T7 | `routes.ts`: `GET /repos/:repoId/context/docs`, `GET /repos/:repoId/context/docs/content?path=`, `GET\|PUT /agents/:id/context`, `GET\|PUT /skills/:id/context`. Local `safeParse` → 400 `invalid_path`; workspace scoping → 404; no write routes on the clone. Register in `modules/index.ts`. Must not call `bumpForSkillChange`. | server/project-context | AC-6..8, AC-10..16 | fastify-best-practices, onion-architecture, zod | T6 |
| T8 | Container `projectContext` getter returning the port; built from `db`, `git`, `tokenizer`, `config`; overridable in `ContainerOverrides`. `pnpm --dir server arch`. | server/platform/container.ts | supports T9 | onion-architecture | T6 |
| T9 | Executor: resolve after `buildSkillBlocks` (return its links, no second `enabledSkillsForPrompt` query); omit-when-empty spread `specs: [{source,text}]`; `specs_read` (read + truncated) and `specs_detail` on success trace, null/omitted on failure traces; `project-context` section in `summarizePromptSections` (counts only, "per call" under map-reduce); try/catch (AC-22); `trace-builder.ts` optional `specsDetail`. `.it.test` (block in prompt, trace persisted, 0 extra provider calls, poll trace row). | server/reviews, platform/trace-builder.ts | AC-17..24, NFR-1, NFR-3 | onion-architecture, typescript-expert, zod | T3, T8 |
| T10 | Client hooks `lib/hooks/project-context.ts` (export from `hooks/index.ts`), query keys distinct from legacy `["context", id]`; `messages/en/projectContext.json` (check namespace registration). Do not reuse legacy `useContextFiles`/`SpecFile`/`context.json`. | client | supports T11–T15 | frontend-ui-architecture, react-best-practices, zod | T1 |
| T11 | Shared `ContextDocPicker` in `client/src/components/context-doc-picker/`: repo selector (M6 default), rows (handle, checkbox, name, folder, type badge, Preview), "k of n attached", `missing` badge, "≈ N tokens" footer from response limits, over-cap warning, error + retry with revert, arrow-button reorder (SkillsTab pattern). RTL tests. | client | AC-34..39, NFR-7 | frontend-ui-architecture, react-best-practices, react-testing-library | T10 |
| T12 | Page `app/repos/[repoId]/context/`: list, search, preview via react-markdown (no `rehype-raw`; raw-HTML test), "Used by N", footer "Indexed: N files · N tokens total", refresh, not_cloned/empty/truncated/error states, no edit/new/upload. RTL tests. | client | AC-28..33 | frontend-ui-architecture, next-best-practices, react-best-practices, react-testing-library | T10, T11 |
| T13 | Agent `ContextTab` (`AgentEditor/constants.ts`, `AgentEditor.tsx`) and Skill `ContextTab` (`skills/constants.ts` + icon in `EditorTab` union, `SkillEditor.tsx`); skill copy = inheritance text + accurate block description. | client | AC-34, AC-35, AC-40 | frontend-ui-architecture, react-best-practices, react-testing-library | T11 |
| T14 | Run drawer `TraceBody`: Specs read row (per-doc tokens, missing/skipped flagged) + expandable, copyable "Project context — attached specs (untrusted)"; unchanged when `specs_detail`/`specs` absent. Extend `RunTraceDrawer.test.tsx` incl. old fixture. | client | AC-41, AC-42, NFR-6 | frontend-ui-architecture, react-testing-library | T1 |
| T15 | Sidebar entry "Project Context" in `client/src/vendor/ui/nav.ts` (approved narrow edit, WORKSPACE, no `gKey`); `activeKeyFor` already maps `/context` (`app-shell/helpers.ts:30`); label possibly from `shell.json`. | client/vendor/ui | AC-43 | frontend-ui-architecture | T12 |
| T16 | Final pass: `diff` shared copies, legacy dead-code note, manual NFR-5 latency note. | all | AC-27, NFR-5 | engineering-insights, typescript-expert | T1..T15 |

## AC coverage
| AC-ID | Tasks | Verified by |
|---|---|---|
| AC-1, AC-2 | T4–T7 | `pnpm --dir server test` |
| AC-3 | — | deferred |
| AC-4..10 | T4, T6, T7 | `pnpm --dir server test` (AC-7: route-table assertion) |
| AC-11..16 | T2, T5, T7 | `pnpm --dir server exec vitest run .it.test` |
| AC-17..24 | T3, T4, T6, T9 | server `.it.test`, unit, `pnpm --dir reviewer-core test` |
| AC-25, AC-26 | T3 | `pnpm --dir reviewer-core test` |
| AC-27 | T1, T16 | `diff`, `pnpm --dir server test` |
| AC-28..33 | T10, T12 | `pnpm --dir client test` |
| AC-34..40 | T10, T11, T13 | `pnpm --dir client test` |
| AC-41, AC-42 | T14 | `pnpm --dir client test` |
| AC-43 | T15 | `pnpm --dir client test`, manual |
| NFR-1 | T9 | `.it.test` provider call count |
| NFR-2 | T6, T8 | unit (mock tokenizer), `pnpm --dir server arch` |
| NFR-3 | T6, T9 | unit log spy: no doc text |
| NFR-4 | T4 | typecheck |
| NFR-5 | T6, T16 | manual measurement |
| NFR-6 | T1, T14 | server + client tests |
| NFR-7 | T11 | `pnpm --dir client test` |

## Test plan
- `pnpm --dir server test`, `pnpm --dir server typecheck`, `pnpm --dir server arch`.
- `pnpm --dir server exec vitest run .it.test` (Docker) — via `test-runner`.
- `pnpm --dir server db:generate` — T2 only.
- `pnpm --dir reviewer-core test` + `typecheck`.
- `pnpm --dir client test` + `typecheck`.
- `diff` of `contracts/project-context.ts`, `trace.ts`, barrels between server and client copies.
- e2e optional (M7); run `npm run e2e:hermetic` once since nav changes.
- Extra tests: `</UNTRUSTED >` / `<\n/untrusted>`; label sanitization (spaces, unicode, 200-char cap); symlink swapped between list and run (realpath at read time); duplicate doc across agent + skill (first wins); map-reduce log says "per call".

## Execution groups (multi-agent)
1. **Group 1 (sequential, first)**: T1, T2.
2. **Parallel after group 1**:
   - Group 2: T3 (`reviewer-core/` only).
   - Group 3: T4–T8 (`server/src/modules/project-context/`, `container.ts`, module registry).
   - Group 4: T10 → T11 → T12 ∥ T13; T14 any time after T1; T15 after T12 (`client/` only).
3. **Group 5 (sequential, last)**: T9 (needs T3, T8).
4. T16 final pass, then review chain (`.claude/agents/README.md` "Typical flow"): implementer diff digests → `test-runner` → `architecture-reviewer`, `security-reviewer`, `plan-verifier`.

## Risks
- `vendor/ui/nav.ts` edit (approved, keep it to one item).
- Path guard + root-segment matching is a security surface (AC-8/AC-9) — test thoroughly.
- List reads up to 500 × 64 KB per call; latency unmeasured (NFR-5).
- Clone re-clone/refresh mid-run → `missing`/`unreadable`.
- Eval replays of old agent versions use today's attachments (D5, accepted).
- Shared copies can drift — T16 diffs.
- `completeAgentRun` before `saveRunTrace` race can flake T9 `.it.test` — poll.
- New routes must not call `bumpForSkillChange` (AC-13).

## Out of scope
Spec authoring; doc editing/upload; auto-selection; attachment versioning; configurable/per-repo roots (AC-3 deferred); `git fetch`; Onboarding/Memory/Evals/CI/Stats tabs; cleanup of legacy `useContextFiles`/`SpecFile`/`context.json` (separate ticket).
