# Verification matrix — PR Brief

Gate: `plan-verifier` (acceptance mode), 2026-10-04. Spec [pr-brief.md](pr-brief.md) · Plan [pr-brief.plan.md](pr-brief.plan.md).

Commits: spec + plan `7d86d6b` · code + tests `4a03907`.

Abbrev: S = `server/src/modules/brief`, ST = `server/test`, IT = `ST/brief.it.test.ts`, SVC = `ST/brief-service.test.ts`, HLP = `ST/brief-helpers.test.ts`, RT = `ST/brief-routes.test.ts`, PB = `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/PrBrief`, DV = `client/src/components/diff-viewer/DiffViewer/DiffViewer.test.tsx`.

| ID | Item | Code | Test | Status |
|---|---|---|---|---|
| AC-1 | Cached GET + `stale`, no model call | S/service.ts | IT | DONE |
| AC-2 | No brief → 200 `null` | S/service.ts | IT, SVC | DONE |
| AC-3 | Unknown PR → 404 | S/service.ts | SVC, IT | DONE |
| AC-4 | One `completeStructured`, `maxRetries: 0`, `risk_brief` model | S/routes.ts, S/service.ts | SVC | DONE |
| AC-5 | No hunk bodies in input | S/helpers.ts | HLP | DONE |
| AC-6, AC-7 | 8,000-token cap, trim order, per-section caps, `[truncated]` | S/helpers.ts | HLP | DONE |
| AC-8 | Stored in `pr_brief`, `agent_runs` row | S/service.ts, S/repository.ts | SVC, IT | DONE |
| AC-9..AC-11 | Drop invented files; focus on PR files only; bad `line` → null | S/helpers.ts | HLP | DONE |
| AC-12 | Zero risks / focus still cached | S/service.ts | HLP, SVC, PB | DONE |
| AC-13..AC-15 | Missing intent / blast / issue / specs / description still generate | S/helpers.ts | HLP, SVC | DONE |
| AC-16 | Model or Zod failure → error, cache untouched | S/service.ts | SVC, IT | DONE |
| AC-17 | Concurrent POSTs → one model call | S/service.ts | SVC, IT | DONE |
| AC-18 | POST rate limit 10/min | S/routes.ts | RT | DONE |
| AC-19 | Untrusted delimiting; plain-text rendering | S/helpers.ts, PB/PrBrief.tsx | HLP, PB | DONE |
| AC-20 | Attached specs: deduped union, fail-soft | `project-context/service.ts`, `repository.ts` | `ST/project-context.it.test.ts`, `project-context/service.test.ts` | DONE |
| AC-21..AC-25 | Generate, skeleton, error + retry, stale notice, full render | PB/PrBrief.tsx | PB | DONE |
| AC-26 | Focus click → `?tab=diff&file=` | PB/PrBrief.tsx, PB/helpers.ts | PB | DONE |
| AC-27, AC-28 | `?file=` expands, opens, scrolls, highlights; unknown file renders normally | `page.tsx`, `DiffTab.tsx`, `DiffViewer.tsx`, `FileCard.tsx` | DV | DONE |
| AC-29, AC-30 | Non-PR risk file is plain text; copy from `brief.json`; focusable focus items | PB/PrBrief.tsx, `messages/en/brief.json` | PB | DONE |
| NFR-1 | Input ≤ 8,000 tokens | S/helpers.ts | HLP | DONE |
| NFR-2 | Cached GET: no model / GitHub call | S/service.ts | SVC, IT | DONE |
| NFR-3 | ≤ 6 risks, ≤ 8 focus, summary ≤ 600 chars | `contracts/brief.ts` (both mirrors) | HLP | DONE |
| NFR-4 | Unparsable stored JSON → no brief | S/service.ts | SVC, IT | DONE |
| NFR-5 | One `brief.generate` log line | S/service.ts | SVC | DONE |

First pass: 31 DONE / 4 PARTIAL. The four partials (AC-24, AC-25, AC-29: swapped AC-IDs in `PrBrief.test.tsx` names; NFR-3: no test) were fixed before the code commit. The result is 35/35 DONE.

Suites: server 496 tests pass (incl. Testcontainers `*.it.test.ts`), client 210 pass. Both typechecks are clean, `pnpm --dir server arch` is clean, and the two `brief.ts` mirrors are identical. 48 AC/NFR-named tests.
