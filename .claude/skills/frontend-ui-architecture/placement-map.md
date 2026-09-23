# Placement map — "I have X, where does it go?"

Exhaustive lookup for `client/src`. Use it when the decision procedure in
[SKILL.md](SKILL.md) §2 doesn't resolve cleanly. Columns: the artifact, its home,
and the condition that moves it.

## Contents

- [UI](#ui)
- [Logic](#logic)
- [Data and state](#data-and-state)
- [Values, copy and styling](#values-copy-and-styling)
- [Types](#types)
- [Tests and fixtures](#tests-and-fixtures)
- [Things with no home here](#things-with-no-home-here)

---

## UI

| Artifact | Home | Moves when |
|---|---|---|
| Screen for a route | `app/<route>/_components/<View>/` | never — it is route-bound by definition |
| Piece of one screen | `app/<route>/_components/<Name>/` | a second route needs it → `src/components/<feature>/` |
| Piece of one feature component | `.../_components/<Parent>/_components/<Child>/` | a sibling of `<Parent>` needs it → hoist one level |
| Component used by 2+ routes | `src/components/<kebab-feature>/` | it becomes app-agnostic → propose for `@devdigest/ui` |
| Generic primitive (badge, chip, drawer, tabs) | `@devdigest/ui` (`src/vendor/ui/`) | — must also be added to `/showcase` |
| Layout chrome (shell, breadcrumbs, page frame) | `src/components/app-shell/`, `src/components/page-shell/` | — |
| Provider component | `src/lib/providers.tsx`, mounted in `app/layout.tsx` | — |
| Error / empty / loading state | `EmptyState`, `ErrorState`, `Skeleton` from `@devdigest/ui` | — don't hand-roll |
| A `renderFoo()` returning JSX | **nowhere** | make it a `<Foo />` component |

Route-local vs shared, stated once: a component lives under `app/**/_components/`
until a **different route** imports it. That import is the promotion trigger, and
until it happens the component is cheaper where it is.

## Logic

| Artifact | Home | Moves when |
|---|---|---|
| `fetch`, URL building, error normalization | `src/lib/api.ts` | never — it is the only transport module |
| Server read/write + query keys + invalidation | `src/lib/hooks/<domain>.ts` | a new domain appears → new sibling file, re-exported from `hooks/index.ts` |
| Pure derivation used by one component | `helpers.ts` in that component's folder | a second feature needs it → `src/lib/<name>.ts` |
| Pure derivation used by 2+ features | `src/lib/<concept>.ts` | — name it for the concept, never `utils.ts` |
| Stateful logic reused by 2+ components | custom hook: local `hooks/` (see `components/app-shell/hooks/`) or `src/lib/hooks/` | — |
| Function that calls a hook | it **is** a hook — `use` prefix, hook file | — |
| Function that calls no hook | plain function, no `use` prefix | — |
| Session/app-wide behaviour | Context in `src/lib/*.tsx` | — `repo-context`, `theme`, `toast` |
| Mapping a wire DTO → display shape | `helpers.ts` or `src/lib/<name>.ts` | never inline in JSX |
| Anything importing from `app/` or `components/` | **not** `src/lib/` | services must not know about screens |

## Data and state

| State | Home | Never |
|---|---|---|
| Server data | TanStack Query (`src/lib/hooks/`) | copied into `useState`/Context |
| Mutation + its cache invalidation | the same `use…Mutation` hook | `invalidateQueries` in a component |
| Shareable / reload-surviving UI state | URL search params (`?tab`, `?status`, `?trace`) | `useState` that silently resets |
| Ephemeral UI state | `useState` in the owning component | lifted higher than its consumers |
| Session concerns (active repo, theme, toasts) | Context in `src/lib/` | a global store |
| Derived values | computed during render | a second `useState` + `useEffect` |
| Form draft state | local `useState` | Context or a store |

## Values, copy and styling

| Artifact | Home | Never |
|---|---|---|
| User-visible string | `messages/en/<namespace>.json` | a literal, or a `constants.ts` entry |
| Lookup map / column keys / tab ids owned by one scope | `constants.ts` in that scope | a project-wide constants bucket |
| Tuning numbers used only by styles (widths, gaps, max-heights) | private `const` at the top of `styles.ts` | `constants.ts` |
| Style objects | `styles.ts`, `export const s` | inline `style={{…}}` literals in JSX |
| A state-dependent style | a function in `styles.ts`: `row: (hover: boolean) => ({…})` | a ternary inside JSX |
| Color | a CSS variable token (`var(--crit)`, `var(--text-muted)`) | a hex or `rgb()` literal |
| Wire enum value (`'CRITICAL'`, `'request_changes'`) | `@devdigest/shared` types | a locally re-declared constant |
| Env-derived value | `src/lib/api.ts` (`API_BASE`) | `process.env` read in a component |
| A new `enum` | an `as const` object + derived union | TS `enum` |

## Types

| Artifact | Home | Note |
|---|---|---|
| Wire DTO / contract | `@devdigest/shared`, re-exported via `src/lib/types.ts` | `import type` only — a runtime import breaks the webpack build |
| Client-local mirror of a server registry | `src/lib/<name>.ts` with a comment saying what it mirrors | see `feature-models.ts`; keep in sync by hand |
| Component props | the component's own `.tsx` | export only if a sibling needs it |
| Type shared by a feature's files | that feature's `types.ts`, or the component file that owns it | — |
| A `types/` folder at `src/` root | **no** | types follow their owner, not a bucket |

## Tests and fixtures

| Artifact | Home |
|---|---|
| Component test | colocated `<Name>.test.tsx` |
| Pure-module test | colocated `<name>.test.ts` (see `src/lib/format-cost.test.ts`) |
| Fixture used by one test | module-level const in that test file |
| Design-system smoke coverage | `src/test/smoke.test.tsx` via the `/showcase` route |
| Cross-screen behaviour | not here — `e2e/flows/NN-<slug>.flow.json` |

## Things with no home here

Each of these is a review finding, with the fix:

| Anti-artifact | Fix |
|---|---|
| `src/utils.ts` / `src/helpers.ts` / `src/common.ts` | split into concept-named `src/lib/<name>.ts` modules |
| `src/constants.ts` (project-wide) | push each value down to the scope that owns it |
| `src/types/` folder | colocate, or `@devdigest/shared` if it's a contract |
| `src/components/index.ts` mega-barrel | import from the feature folder directly |
| A global store (Redux/Zustand/Jotai) | TanStack Query + URL params + `useState` already cover it |
| A `containers/` folder | hooks already separate data from view; no wrapper layer needed |
| `atoms/` `molecules/` `organisms/` | the design system is `@devdigest/ui`; features are feature-folders |
| An abstraction with one consumer | inline it back |
