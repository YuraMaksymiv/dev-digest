# Verification matrix — Onboarding Generator

Gate: `plan-verifier` (acceptance mode), 2026-10-04. Spec [onboarding-generator.md](onboarding-generator.md) · Plan [onboarding-generator.plan.md](onboarding-generator.plan.md).

Commits: spec `ecdaa48`/`d816f93` · plan `b3a6d02` · code `1be0c90` · tests `e0c203c` · fixes `37a603a` · verification (this file + NFR-8 test).

Abbrev: S = `server/src/modules/onboarding`, ST = `server/test`, C = `client/src/app/repos/[repoId]/onboarding-tour`, IT = `ST/onboarding.it.test.ts`, SVC = `ST/onboarding-service.test.ts`, HLP = `ST/onboarding-helpers.test.ts`, OTV = `C/_components/OnboardingTourView/OnboardingTourView.test.tsx`, TS = `C/_components/TourSections/TourSections.test.tsx`.

| ID | Task | Code | Test | Commits | Status |
|---|---|---|---|---|---|
| AC-1..AC-6 | T1, T6, T8 | S/service.ts, repository.ts, helpers.ts | SVC, IT | code, tests | DONE |
| AC-7 | T8 | S/helpers.ts `isStale` | SVC, IT, HLP | code, tests, fix | DONE |
| AC-8 | T9 | S/routes.ts | `ST/onboarding-routes.test.ts`, SVC, IT | code, tests | DONE |
| AC-9, AC-10 | T5 | S/helpers.ts | HLP, SVC, `S/helpers.test.ts` | code, tests | DONE |
| AC-11 | T5 | S/clone.ts | `ST/onboarding-clone.test.ts` | code, tests, fix | DONE |
| AC-12..AC-14 | T4, T5 | S/helpers.ts, `repo-intel` facade | HLP, IT | code, tests | DONE |
| AC-15 | T8 | S/service.ts (`getCriticalPaths`) | SVC | code, tests, fix | DONE |
| AC-16 | T5 | S/helpers.ts | HLP, SVC | code, tests | DONE |
| AC-17 | T3, T8 | S/service.ts, LLM adapters | SVC, IT, adapter tests | code, tests | DONE |
| AC-18..AC-20 | T5, T7, T8 | S/helpers.ts, prompt | HLP, SVC | code, tests | DONE |
| AC-21 | T2, T6 | schema, migration 0017, S/repository.ts | SVC, IT | code, tests | DONE |
| AC-22 | T8 | S/service.ts (`onboarding.generate` log) | SVC, `S/service.test.ts` | code, tests, fix | DONE |
| AC-23 | T8 | S/service.ts single-flight | SVC, IT | code, tests, fix | DONE |
| AC-24..AC-27 | T6, T8 | S/service.ts, repository.ts | SVC, IT | code, tests | DONE |
| AC-28..AC-46, AC-48 | T10–T12 | C/** | OTV, TS | code, tests | DONE |
| AC-47 | T13, T14 | `components/app-shell/nav-extension.ts`, `helpers.ts` | `nav-extension.test.ts`, `helpers.test.ts`; e2e `09-onboarding-tour` | code, tests | DONE (unit) · e2e not run |
| NFR-1 | T3, T8 | S/service.ts, adapters | SVC, IT | code, tests | DONE |
| NFR-2..NFR-7 | T5, T7, T8, T12 | S/**, C/** | HLP, SVC, IT, TS | code, tests | DONE |
| NFR-8 | T2 | migration 0017 | `ST/onboarding-migration.test.ts` | code, verification | DONE |

## Unclosed rows before merge

| ID | Gap | To close |
|---|---|---|
| AC-47, AC-42 (e2e level) | `e2e/flows/09-onboarding-tour.flow.json` written but not executed — `agent-browser` binary not installed | `npm i -g agent-browser && agent-browser install`, then `./scripts/e2e.sh` |

Last full run: server 451/451 (incl. 20 onboarding IT), client pass, reviewer-core pass, `arch` pass.
