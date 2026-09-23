# Worked examples

Each case is drawn from a real file in `client/`. The point of a case is the
*placement decision*, not the code.

## Contents

1. [Thin route entry vs. compositor page](#1-thin-route-entry-vs-compositor-page)
2. [A component folder's public API](#2-a-component-folders-public-api)
3. [Constants: colocated vs. hoisted vs. style-private](#3-constants-colocated-vs-hoisted-vs-style-private)
4. [A helper that earned promotion](#4-a-helper-that-earned-promotion)
5. [Business logic pulled out of a component](#5-business-logic-pulled-out-of-a-component)
6. [State: query vs. URL vs. local](#6-state-query-vs-url-vs-local)
7. [The `"use client"` boundary](#7-the-use-client-boundary)
8. [Import direction violations](#8-import-direction-violations)
9. [A DTO that must not be re-declared](#9-a-dto-that-must-not-be-re-declared)
10. [When *not* to split](#10-when-not-to-split)

---

## 1. Thin route entry vs. compositor page

**The target shape** — `app/agents/page.tsx`, 7 lines:

```tsx
import { AgentsListView } from "./_components/AgentsListView";

/* Route: /agents (Agents list). Thin route entry — the view, its create modal,
   styles, constants, helpers and i18n are colocated under _components/AgentsListView. */
export default function AgentsPage() {
  return <AgentsListView />;
}
```

The route file says only *which* screen this URL is. Everything else — including
`"use client"` — lives one level down, so the screen can be tested, moved or
reused without touching routing.

**The ceiling** — `app/repos/[repoId]/pulls/[number]/page.tsx`, 185 lines,
resolves `:number → uuid`, fans data into four tab components, owns `?tab`. That
is a compositor and it is legitimate. But it is already over the ~120-line
extract trigger: the next feature added to it should arrive as
`_components/PrDetailView/`, not as more lines in `page.tsx`.

## 2. A component folder's public API

`app/repos/[repoId]/pulls/_components/FindingsCell/index.ts` is one line:

```ts
export { FindingsCell, FindingsCell as default } from "./FindingsCell";
```

That single line is the folder's contract. Importers write
`import { FindingsCell } from "./_components/FindingsCell"` and stay ignorant of
`styles.ts`, `helpers.ts` and the test beside it.

What breaks this: adding `export * from "./styles"` to the barrel. Now every
importer pulls the style module, `styles.ts` can no longer be refactored freely,
and a file inside the folder importing the folder's own `index.ts` creates a
cycle that bundlers fail on with an unhelpful error.

## 3. Constants: colocated vs. hoisted vs. style-private

Three different scopes, three different homes — all present in this tree.

**Colocated** — `_components/AgentCard/constants.ts`, owned by one component:

```ts
/** Model → chip colour. Falls back to --text-secondary for unknown models. */
export const MODEL_COLOR: Record<string, string> = { "gpt-4.1": "#3b82f6", … };
```

**Hoisted to the route** — `app/repos/[repoId]/pulls/constants.ts` holds
`COLUMN_KEYS` and `SKELETON_ROWS`, used by `page.tsx` and by children.

**Style-private** — `FindingsCell/styles.ts` keeps its tuning numbers inside the
style module, unexported:

```ts
const POPOVER_WIDTH = 440;
const POPOVER_GAP = 8;
const POPOVER_MAX_HEIGHT = 360;
```

These are layout facts, not domain facts. Promoting them to `constants.ts` would
expose them to importers that have no business knowing them.

**The failure mode** would be a single `src/constants.ts` collecting all three.
It gives no guidance about what belongs in it, so it grows without bound and
every feature ends up importing values it doesn't use.

## 4. A helper that earned promotion

Local — `_components/AgentCard/helpers.ts`, pure, one consumer, next to its data:

```ts
import { MODEL_COLOR } from "./constants";

/** Resolve the chip colour for an agent's model (unknown → secondary token). */
export function modelColor(model: string): string {
  return MODEL_COLOR[model] ?? "var(--text-secondary)";
}
```

Promoted — `src/lib/format-cost.ts`, `src/lib/github-urls.ts`,
`src/lib/model-label.ts`. Each was needed by more than one feature, and each is
named for the concept it owns.

Note what *didn't* happen: they were not merged into `src/lib/utils.ts`. The
moment a module's name stops constraining its contents, it accumulates unrelated
functions, nobody can find what's already there, and the same helper gets written
twice.

## 5. Business logic pulled out of a component

`src/lib/hooks/core.ts` keeps the mutation and its cache consequences together:

```ts
export function useTestConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConnTestProvider | { provider: ConnTestProvider; key?: string }) => {
      const body = typeof input === "string" ? { provider: input } : input;
      return api.post<ConnTestResult>("/settings/test-connection", body);
    },
    // Saving/validating a provider key can change which models resolve — drop the
    // cached (possibly empty) model lists so the agent picker refetches, and
    // refresh the "Configured / Not set" key-status badges.
    onSuccess: (res) => {
      if (res.ok) {
        qc.invalidateQueries({ queryKey: ["provider-models"] });
        qc.invalidateQueries({ queryKey: ["secrets-status"] });
      }
    },
  });
}
```

The component calls `useTestConnection()` and renders. It never sees a query key.

Had the invalidation lived in the component's `onClick` instead, every future
caller of that mutation would have to remember to repeat it — and the one that
forgets ships a stale-UI bug that reproduces only after a specific sequence of
clicks.

**Review signals for this case:** a `queryKey` array, `invalidateQueries`, or a
bare `fetch(` appearing anywhere under `app/` or `src/components/`.

## 6. State: query vs. URL vs. local

`app/repos/[repoId]/pulls/page.tsx` uses all three deliberately:

```tsx
const { data: pulls, isLoading, isError, error, refetch } = usePulls(repoId); // server
const status = search.get("status") ?? "needs_review";                        // URL
const [query, setQuery] = React.useState("");                                 // local
```

- `pulls` is server state — owned by TanStack Query, never copied into `useState`.
- `status` is in the URL because a filtered PR list is a thing people link to and
  come back to; a `useState` filter silently resets on reload.
- `query` is a free-text box: ephemeral, personal, not worth a URL round-trip.

And the derived list is **computed during render**, not stored:

```tsx
const filtered = (pulls ?? []).filter(…).sort(…);
const openCount = (pulls ?? []).filter((p) => OPEN_STATUSES.has(p.status)).length;
```

A `useState` + `useEffect` pair mirroring `filtered` would add a render where the
list and the filter disagree — the classic derived-state bug.

## 7. The `"use client"` boundary

- `app/layout.tsx` — Server Component. Mounts `<Providers>{children}</Providers>`,
  a client component that takes `children`, so the tree interleaves instead of
  turning the whole app into one client bundle at the root.
- `app/repos/[repoId]/pulls/[number]/page.tsx` — `"use client"`. This is the entry.
- `_components/RunTraceDrawer/RunTraceDrawer.tsx`,
  `_components/ReviewRunAccordion/ReviewRunAccordion.tsx` — **no directive**, and
  that is correct: they are only reached through a client entry, so they are
  already in the client graph.

`"use client"` is a boundary in the module graph, not a per-file badge. Sprinkling
it on every component doesn't make anything more correct; it just makes the real
boundary impossible to see in review.

## 8. Import direction violations

Present in the tree today, in `pulls/[number]/page.tsx`:

```tsx
import { AppShell } from "../../../../../components/app-shell";   // ✗
import { usePulls } from "../../../../../lib/hooks";              // ✗
```

versus the same file, a few lines up:

```tsx
import { RepoNotFound } from "@/components/repo-not-found";       // ✓
```

`@/` is configured in `tsconfig.json` (`"@/*": ["./src/*"]`). The deep relative
form breaks the moment the route nests one level deeper, and it hides the layer
being crossed — the thing reviews are supposed to catch.

The direction violation to watch for is worse and not present yet: a route
importing another route's `_components/`. When that need appears, the answer is
promotion to `src/components/<feature>/`, never a sideways import.

## 9. A DTO that must not be re-declared

`src/lib/types.ts` re-exports contracts from `@devdigest/shared`; nothing in
`client/` redefines a wire shape. The constraint is sharper than style — from
`src/lib/feature-models.ts`:

> the client can only import TYPES from the vendored shared package — importing a
> runtime VALUE pulls `vendor/shared/index.ts` into the webpack bundle, whose
> `./contracts/*.js` re-exports Next's webpack can't resolve.

So: `import type { PrMeta } from "@devdigest/shared"` is fine; importing a value
is a build failure. When a runtime value is genuinely needed, mirror it in
`src/lib/` with a comment naming the source of truth — which is exactly what
`FEATURE_MODELS` in `feature-models.ts` does.

A related trap, from `client/INSIGHTS.md`: the `Severity` union exported by
`@devdigest/ui` has four members (it adds `INFO`) while the wire enum has three.
Type loops off the payload type, not the UI union.

## 10. When *not* to split

`RunHistory.tsx` is 235 lines — the largest non-showcase component in the tree.
Size alone is not the argument for splitting it. Ask instead:

- is any part of it needed elsewhere? (no → no reuse pressure)
- are two unrelated concerns sharing its state? (if yes → split)
- does a JSX branch need its own test? (if yes → split that branch out)
- has state rendering become stacked ternaries? (if yes → extract the layout and
  early-return per state)

If none of those hold, splitting it produces two files that must be read together
to understand either, plus a props interface that exists only to reunite them.
Duplication is cheaper than the wrong abstraction — and an abstraction with one
consumer is not an abstraction, it's indirection.

For calibration: the whole non-vendor tree is ~5.2k lines of TSX, and typical
components run 100–180 lines. A file past 200 has usually tripped one of the four
triggers already; check which one, and split along *that* seam rather than at the
midpoint.
