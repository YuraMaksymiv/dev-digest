---
name: frontend-ui-architecture
version: 1.0.0
description: "UI architecture and code organization for DevDigest's client/ (Next.js 15 App Router + React 19). Answers placement questions: where a new component goes, when to split it, where constants/helpers/styles/types live, where business logic belongs, and which state goes to TanStack Query vs the URL vs useState. Use this skill whenever adding, moving, splitting, extracting or reviewing anything under client/src — including when the user only says 'add a screen', 'add a component', 'where should this go', 'extract this', 'refactor this component', 'this file is getting long', or 'clean up the structure' — and before creating any new file or folder in client/src. Covers route-segment vs shared placement, _components colocation, the src/lib service layer, @devdigest/ui and @devdigest/shared boundaries, import direction and promotion rules."
metadata:
  tags: architecture, code-organization, react, nextjs, app-router, file-structure, colocation, client
---

# Frontend UI Architecture — `client/`

Placement and boundary rules for `client/` (`@devdigest/web`). This skill answers
**"where does this code go, and when does it move?"** Everything here is
calibrated to this repo's actual tree — not generic advice.

## Scope, and what this skill does NOT own

| Question | Owner |
|---|---|
| Where a file goes, when to split/promote, import direction | **this skill** |
| The mechanical shape of one feature component (styles/i18n/a11y/test idioms) | [`client/docs/component-anatomy.md`](../../../client/docs/component-anatomy.md) |
| Hook correctness, `useEffect`/memo misuse, keys, render factories | `react-best-practices` |
| RSC semantics, metadata, route handlers, image/font, bundling | `next-best-practices` |
| Contract shapes | `zod`, `typescript-expert` |

If a rule here contradicts `component-anatomy.md`, that doc wins on *shape*, this
skill wins on *placement*. Read [`README.md`](README.md) for the sources these
rules are drawn from.

## Reference files

- [`placement-map.md`](placement-map.md) — the exhaustive "I have X, where does
  it go?" table. Open it when the decision tree below doesn't resolve cleanly.
- [`examples.md`](examples.md) — worked before/after cases taken from real files
  in this repo. Open it when you need to see a rule applied.

---

## 1. The layer map

Five layers. **Imports only ever point down.** This is the single rule that keeps
the tree from turning into a graph — everything else in this skill is a
consequence of it.

```
  app/**/page.tsx · layout.tsx          route entry (thin)
        ↓
  app/<route>/**/_components/<Name>/    route-local UI
        ↓
  src/components/<feature>/             cross-route feature UI
        ↓
  src/lib/                              services: api · hooks · contexts · pure modules
        ↓
  src/vendor/ui  ·  src/vendor/shared   design system · wire contracts (leaves)
```

Consequences, all enforceable by eye in review:

- `src/lib/**` must never import from `src/components/**` or `src/app/**`. A
  service that knows about a screen is not a service.
- `src/vendor/**` never imports app code. It is vendored — treat it as an
  external package that happens to live in-tree.
- **Sibling routes must not reach into each other's `_components/`.** A second
  consumer in a different route is the signal to promote (§5), not to write
  `../../../agents/_components/...`.
- There is no ESLint config in `client/`, so nothing enforces this mechanically.
  It holds only because reviews check it — which is why it is stated first.

## 2. The decision procedure

Given a new piece of code, walk this in order and stop at the first match:

1. **Is it user-visible copy?** → `client/messages/en/<namespace>.json`, read via
   `useTranslations("<namespace>")`. Never a string literal, never a constant.
2. **Is it a generic, app-agnostic UI primitive** (button, badge, chip, drawer)?
   → it almost certainly already exists in `@devdigest/ui`. Import it. Adding a
   new one means also adding it to `/showcase` or the smoke test fails CI.
3. **Does it talk to the API?** → `src/lib/api.ts` for transport,
   `src/lib/hooks/<domain>.ts` for the React Query hook. Never `fetch()` in a
   component.
4. **Is it a pure function over data, with no React and no I/O?** → `helpers.ts`
   beside its only consumer; `src/lib/<verb-or-noun>.ts` once a second *feature*
   needs it.
5. **Is it used by exactly one component?** → colocate it in that component's
   folder (`constants.ts` / `helpers.ts` / `styles.ts`).
6. **Is it used across one route subtree?** → hoist to the nearest common
   ancestor inside that route (e.g. `app/repos/[repoId]/pulls/constants.ts`).
7. **Is it used by more than one route?** → `src/components/<feature>/` for UI,
   `src/lib/<name>.ts` for logic.

The ordering matters: it pushes code **down and outward only when a second
consumer actually appears**. Speculative placement in a shared folder is the most
common way this tree rots — an abstraction with one consumer costs more than the
duplication it removes.

## 3. Route segments

`src/app/<segment>/` is routing, and as little else as possible.

- **`page.tsx` is an entry, not a screen.** The established shape is a
  delegation: `export default function AgentsPage() { return <AgentsListView />; }`
  with everything real under `_components/AgentsListView/`. See
  `app/agents/page.tsx` and `app/settings/[section]/page.tsx`.
- A page may instead act as a **compositor** — resolve route params, pick a tab,
  fan data out to tab components — as `app/repos/[repoId]/pulls/[number]/page.tsx`
  does. That is legitimate, but it is the ceiling, not the target.
- **Trigger to extract a `<View>`:** the page exceeds ~120 lines, or it holds any
  `styles.ts`-worthy styling, or it declares its own constants. Nothing in this
  repo is over 260 lines; treat >200 as a seam you have already missed.
- `_`-prefixed folders are opted out of routing by Next.js, which is what makes
  colocation inside `app/` safe. Use `_components/`, not a route group `(…)`, for
  this — route groups are for URL-neutral *routing* organization.
- Children of a feature component nest one level deeper:
  `_components/<Parent>/_components/<Child>/`.

### `"use client"` placement

`"use client"` marks a **boundary in the module graph**, not a per-file
annotation. Put it at the *entry* of a client subtree; everything that entry
imports is already client code and must not repeat the directive.

Real examples in this repo: `RunTraceDrawer.tsx` and `ReviewRunAccordion.tsx`
carry no directive because they are only ever imported by client entries, while
`pulls/page.tsx` does carry one. `app/layout.tsx` stays a Server Component and
mounts providers as a separate client component taking `children`.

This app is deliberately client-heavy — data comes from the Fastify API through
TanStack Query, not from RSC data fetching. Don't "fix" that by converting screens
to Server Components; the API boundary is the architecture.

## 4. One component's folder

```
_components/FindingsCell/
  FindingsCell.tsx        the component
  index.ts                export { FindingsCell, FindingsCell as default } from "./FindingsCell";
  styles.ts               export const s = { … } (optional)
  constants.ts            module-level data this component owns (optional)
  helpers.ts              pure derivations (optional)
  FindingsCell.test.tsx   colocated test (optional but expected)
  _components/            children, one level deeper (optional)
```

- `index.ts` is the folder's **public API** — one line, both named and default.
  Do not add other exports to it, and do not import a sibling's internals past it.
- `styles.ts` exports a const named **`s`**. (`FindingsCell/styles.ts` exports
  `cellStyles` — that is the one outlier in the tree, not a second convention.)
- Barrels stop here. There is no `src/components/index.ts` and there must not be:
  folder-wide barrels pull the whole subtree into every importer's module graph
  and invite circular imports. `src/lib/hooks/index.ts` is a deliberate exception
  because it is a small, flat, genuinely shared surface.

### When to split a component

Split on a **problem**, not on a line count:

- a piece of it is needed somewhere else (reuse is now real, not hypothetical);
- its state is confusing because two unrelated concerns share one body;
- a branch of the JSX needs its own test;
- rendering state variants (`loading` / `error` / `empty` / `loaded`) has grown
  stacked ternaries — extract the shared layout, pass `children`, early-return per
  state.

Do **not** split because a file "feels long" if none of the above holds:
duplication is cheaper than the wrong abstraction. In practice a component in this
repo that has crossed ~200 lines has hit at least one of those triggers already.

Never extract a `renderFoo()` function returning JSX. Extract a component.

## 5. Promotion and demotion

Placement is not a one-time decision — it follows consumers.

| Trigger | Move |
|---|---|
| Second consumer inside the same route subtree | hoist to the nearest common `_components/` or the route's own `constants.ts`/`helpers.ts` |
| Second consumer in a **different route** | promote to `src/components/<feature>/` (UI) or `src/lib/<name>.ts` (logic) |
| Third consumer, and it is app-agnostic | propose it for `@devdigest/ui` — and add it to `/showcase` |
| A shared thing lost all consumers but one | demote it back next to that consumer |

Promote on the second *real* consumer, not the second *imagined* one. When you do
promote, rename to what the code is rather than where it came from.

## 6. Where business logic lives

A component body should contain: hook calls, event handlers, and JSX. Everything
else has a home.

| Kind of logic | Home | Note |
|---|---|---|
| HTTP transport, error normalization | `src/lib/api.ts` | the only place `fetch` appears |
| Server reads/writes, query keys, cache invalidation | `src/lib/hooks/<domain>.ts` | invalidation lives with the mutation, never in the component |
| Pure derivation from props/data | `helpers.ts` (local) → `src/lib/<name>.ts` (shared) | no React, no I/O |
| Stateful logic reused across components | a custom hook — local `hooks/` dir, or `src/lib/hooks/` | if a function calls a hook it *is* a hook; name it for the use case (`useRunTrace`), not the lifecycle (`useMount`) |
| Session/app-wide concerns | a Context in `src/lib/*.tsx` | `repo-context`, `theme`, `toast` |
| Presentation-only formatting | `src/lib/<name>.ts` | `format-cost.ts`, `model-label.ts`, `github-urls.ts` |

Signals that logic is in the wrong place — each is a review finding:

- `fetch(` anywhere outside `src/lib/api.ts`
- a `queryKey` array or `invalidateQueries` inside a component
- a component reshaping a wire DTO into a display model inline
- a `useEffect` that only computes a value from props or state
- a pure function declared inside a component body that closes over nothing

## 7. State placement

There is **no global store**, and adding Redux/Zustand/Jotai here would be a
regression: once TanStack Query owns server data, what's left is small enough that
a store has nothing to manage.

| State | Home |
|---|---|
| Server data and mutations | TanStack Query, via `src/lib/hooks/` |
| UI state that should survive reload or be shareable (`?tab`, `?status`, `?trace`) | URL search params — `useSearchParams` + `router.replace` |
| Ephemeral local UI state (hover, open/closed, draft input) | `React.useState` in the component that owns it |
| Session-wide concerns (active repo, theme, toasts) | Context in `src/lib/` |
| Anything derived from the above | computed during render — never a second `useState` |

Never copy a query result into `useState` or Context: that snapshot stops
revalidating, and refetch-on-focus, dedupe and staleness silently stop working for
it. If a query refetches too eagerly, raise `staleTime` — don't mirror the data.

## 8. Constants, types and imports

**Constants.** `constants.ts` holds module-level data this scope owns — lookup
maps, column keys, tab ids, tuning numbers. It is a *scope's* constants, never a
project-wide bucket; a `constants.ts` that collects unrelated values from several
features has become the same dumping ground as a `utils.ts`. Style magic numbers
stay private inside `styles.ts` (see `FindingsCell/styles.ts`). Wire enum values
come from `@devdigest/shared` — never re-declare `'CRITICAL'` as a local constant.
Prefer `as const` objects with a derived union over TS `enum`.

**Helpers.** `src/lib/` has no `utils.ts` or `helpers.ts`, and should not grow
one: shared modules are named for the concept (`format-cost.ts`,
`github-urls.ts`, `model-label.ts`). A name that gives no guidance about what
belongs in it grows without bound — that is the whole mechanism of the
utils-dumping-ground.

**Types.** Wire contracts come from `@devdigest/shared`, re-exported through
`src/lib/types.ts`; never redefine a DTO locally. Import them as `import type`
only — importing a runtime value from the vendored shared package pulls
`vendor/shared/index.ts` into the webpack bundle and breaks the build (this is why
`feature-models.ts` mirrors the registry instead of importing it). Component props
stay in the component file, exported only if a sibling genuinely needs them.

**Imports.**

- Always the `@/` alias (`@/lib/hooks`, `@/components/app-shell`) — never
  `../../../../../lib/hooks`. `pulls/[number]/page.tsx` still does the latter; it
  is the counter-example, not the pattern.
- UI comes from the `@devdigest/ui` barrel only — never a `vendor/ui/` layer file.
- Colors are CSS variable tokens (`var(--crit)`, `var(--text-muted)`), never
  literals — the theme switches on `data-theme`.

## 9. Naming

| Thing | Convention | Example |
|---|---|---|
| Route-local / cross-route component folder | `PascalCase/` holding `PascalCase.tsx` + `index.ts` | `_components/FindingsCell/` |
| `src/components/` feature folder | `kebab-case/` containing PascalCase components | `src/components/diff-viewer/` |
| `src/lib/` module | `kebab-case.ts`, named for the concept | `format-cost.ts` |
| Hook file | `src/lib/hooks/<domain>.ts` | `reviews.ts`, `trace.ts` |
| Hook | `use<UseCase>` | `usePrReviews`, `useRunTrace` |
| Styles export | `const s` in `styles.ts` | `s.tableCard` |
| i18n namespace | one file per feature | `messages/en/prReview.json` |
| Test | colocated `<Name>.test.tsx` | `FindingsCell.test.tsx` |

## 10. Adding a new screen — the recipe

1. `app/<route>/page.tsx` — thin entry delegating to a `<View>`.
2. `app/<route>/_components/<View>/` — `View.tsx`, `index.ts`, `styles.ts`.
3. Copy → `messages/en/<namespace>.json`; read with `useTranslations`.
4. Data → a hook in `src/lib/hooks/<domain>.ts` over `api.*`. Nothing else fetches.
5. Compose from `@devdigest/ui`; only build a new component when the barrel has no fit.
6. Shareable UI state → URL params; the rest → `useState` in the owning component.
7. Colocate `constants.ts` / `helpers.ts` only when that scope actually owns them.
8. Colocated `<View>.test.tsx`.
9. New `@devdigest/ui` component → register it in `/showcase`, or CI fails.

## 11. Review checklist

- [ ] Does any import point *up* the layer map, or sideways into another route's `_components/`?
- [ ] Is `page.tsx` still an entry or compositor, not a screen?
- [ ] Is `"use client"` only at the boundary entry, not repeated downstream?
- [ ] Any `fetch`, `queryKey` or `invalidateQueries` outside `src/lib/`?
- [ ] Any user-visible string that isn't in `messages/en/`?
- [ ] Any hard-coded color instead of a `var(--…)` token?
- [ ] Any deep relative import that should be `@/`?
- [ ] Any shared helper/constant with exactly one consumer? (demote it)
- [ ] Any duplicated helper with two consumers in different routes? (promote it)
- [ ] Any derived value stored in `useState`, or a query result copied into state?
- [ ] Does a new component folder have its `index.ts`, and is it imported through it?
