# frontend-ui-architecture

**Version 1.0.0** · scope: `client/` (`@devdigest/web`) · last reviewed 2026-09-20

UI architecture and code organization for the DevDigest studio UI. The skill
answers placement questions — *where does this component / constant / helper /
piece of business logic go, and when does it move?* — for a Next.js 15 App Router
+ React 19 codebase.

## Files

| File | Purpose | Read when |
|---|---|---|
| [`SKILL.md`](SKILL.md) | Layer map, decision procedure, placement rules, review checklist | Always — it's the skill body |
| [`placement-map.md`](placement-map.md) | Exhaustive "artifact → home → moves when" tables | The decision procedure doesn't resolve cleanly |
| [`examples.md`](examples.md) | 10 worked cases from real files in `client/` | You need to see a rule applied |
| `README.md` | This file: scope, version, sources | Deciding whether to change the skill |

## Scope boundaries

This skill owns **placement** — the tree, the layers, the import direction, and
when code moves between them. It deliberately does not duplicate:

- [`client/docs/component-anatomy.md`](../../../client/docs/component-anatomy.md)
  — the mechanical shape of one feature component (styles, i18n, a11y, test
  idioms). On *shape*, that doc is authoritative; this skill is authoritative on
  *placement*.
- `react-best-practices` — hook correctness, `useEffect`/memo misuse, keys,
  render factories, conditional rendering.
- `next-best-practices` — RSC semantics, metadata, route handlers, bundling.
- `zod` / `typescript-expert` — contract and type-level concerns.

**Explicitly out of scope: performance.** Bundle size, memoization and render
cost belong to the skills above. Where this skill mentions a cost (barrel files,
client-boundary breadth) it is as an argument about structure, not a tuning
recommendation.

## Why this is DevDigest-specific

The rules are calibrated against the real tree, not a generic template. Load-
bearing local facts:

- `client/` has **no ESLint config**, so import boundaries are review-enforced,
  not lintable. If that changes, `import/no-restricted-paths` or
  `eslint-plugin-boundaries` could encode the §1 layer map directly.
- The app is **client-heavy by design** — data comes from the Fastify API via
  TanStack Query, not from RSC data fetching. Generic App Router advice that
  assumes server-side reads does not transfer wholesale.
- `@devdigest/shared` is vendored and **type-only importable**; a runtime import
  breaks the webpack build.
- There is **no global store**, and the skill argues for keeping it that way.
- Size calibration (typical component 100–180 lines, nothing over ~260) comes
  from measuring the tree, not from a style guide.

## Changelog

### 1.0.0 — 2026-09-20

Initial version. Layer map and import direction; the 7-step placement decision
procedure; route-segment and `"use client"` boundary rules; component folder
anatomy and split triggers; promotion/demotion rules; business-logic homes; state
placement (query / URL / local / context); constants, helpers, types and import
rules; naming table; new-screen recipe; review checklist. Plus `placement-map.md`
and 10 worked examples.

---

## Sources

Every source below was fetched and verified while writing v1.0.0. Grouped by the
question it answers. Where a rule in `SKILL.md` is contested in the wider
community, the disagreement is noted.

### Colocation and folder structure

- [Colocation](https://kentcdodds.com/blog/colocation) — Kent C. Dodds, 2019-06-17. "Place code as close to where it's relevant as possible." The basis for §2's stop-at-the-first-match ordering and for colocated `constants.ts`/`helpers.ts`/`styles.ts`.
- [File Structure](https://legacy.reactjs.org/docs/faq-structure.html) — React team (legacy docs). Group by feature or by type, no endorsement of either; limit nesting to three or four levels; don't spend more than five minutes choosing.
- [React Folder Structure in 8 Steps](https://www.robinwieruch.de/react-folder-structure/) — Robin Wieruch, updated 2026-05-05. Staged progression from single file → component folders → technical folders → feature folders; the "when do I graduate" reference behind §5's promotion triggers.
- [Project Structure (Bulletproof React)](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — Alan Alickovic. The unidirectional rule `shared → features → app`, features never importing each other, enforced via `import/no-restricted-paths`. Source of §1's layer map shape. Note: it advises *against* barrel files, which is why §4 restricts them to component folders.
- [Components and Styling (Bulletproof React)](https://github.com/alan2207/bulletproof-react/blob/master/docs/components-and-styling.md) — Alan Alickovic. Keep components/state/styles close to use; never nest render functions inside a component; reach for composition when prop count grows.
- [Screaming Architecture](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html) — Robert C. Martin, 2011-09-30. Top-level directories should announce the domain, not the framework.
- [Screaming Architecture — Evolution of a React folder structure](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25) — Johannes Kettmann, 2022-02-25. Five-stage walkthrough from group-by-type to group-by-feature.
- [Tao of React](https://alexkondov.com/tao-of-react/) — Alex Kondov, 2021-01-18. Group by domain; use absolute path aliases (§8); promote a component to its own folder with an `index` once it accrues related files; declare helpers outside the component unless they need closure.

### Feature-Sliced Design

Considered and deliberately **not adopted** — FSD's six-layer taxonomy is heavier
than a ~5k-line UI needs, and this repo already has a working feature-folder
convention. Its public-API and layer-import rules did inform §1 and §4.

- [FSD — Overview](https://feature-sliced.design/docs/get-started/overview) — layers → slices → segments; import only from layers strictly below.
- [FSD Reference — Layers](https://feature-sliced.design/docs/reference/layers) — the precise import rule and its exceptions; layers are optional.
- [FSD Reference — Slices and Segments](https://feature-sliced.design/docs/reference/slices-segments) — the `ui` / `api` / `model` / `lib` / `config` segments; every slice defines a public API.
- [FSD Reference — Public API](https://feature-sliced.design/docs/reference/public-api) — the strict barrel rule, *and* an honest list of its costs (circular imports, bundle bloat, IDE auto-imports bypassing the barrel). Directly behind §4's "barrels stop at the component folder."
- [FSD Guide — Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs) — resolving the `app`/`pages` name collision; `index.server.ts` for slices mixing server-only and client modules.
- [The Ultimate Next.js App Router Architecture](https://feature-sliced.design/blog/nextjs-app-router-guide) — Evan Carter, 2026-01-23. "Keep route files as thin orchestration layers" — the argument behind §3.
- [Steiger](https://github.com/feature-sliced/steiger) — FSD linter; evidence that layer rules are mechanically checkable.

### Atomic Design — considered, not adopted

- [Atomic Web Design](https://bradfrost.com/blog/post/atomic-web-design/) — Brad Frost, 2013-06-10. The original atoms/molecules/organisms/templates/pages taxonomy.
- [Atomic Design, Chapter 2](https://atomicdesign.bradfrost.com/chapter-2/) — Brad Frost, 2016. Frost's own caveats: a mental model, not a linear process; the naming is not dogma.
- [Against atomic design](https://blog.damato.design/posts/against-atomic-design/) — Donnie D'Amato. The chemistry metaphor is ambiguous in practice — practitioners can't agree where a given component belongs.
- [FSD — Comparison with other approaches](https://feature-sliced.design/docs/about/alternatives) — Atomic Design addresses visual composition, not business-logic responsibility. The common compromise (atoms live in the design system, features are organized separately) is what this repo already does with `@devdigest/ui`.

### Barrel files

- [Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) — Dominik Dorfmeister (TkDodo), 2024-07-26. Circular imports and dev-server cost; barrels are for library entry points, not for organizing application directories. Behind §4's rule that `index.ts` stays at the component-folder level.
- [The barrel file debacle](https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/) — Marvin Hagemeister, 2023-10-08. Quantifies module-graph cost; barrels compound because each pulls in further barrels.

### When to split a component

- [When to break up a component into multiple components](https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components) — Kent C. Dodds, 2019-07-19. Split on a problem (reuse, confusing state, testing, merge friction), "NOT BEFORE." The direct source of §4's four triggers and of "duplication is far cheaper than the wrong abstraction."
- [Component Composition is great btw](https://tkdodo.eu/blog/component-composition-is-great-btw) — TkDodo, 2024-09-21. Extract the shared layout and pass `children`; early-return per state instead of stacked ternaries.
- [Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) — Dan Abramov, 2015-03-23, **with the author's 2019 retraction note**: he no longer suggests splitting components this way, because Hooks extract the same logic without a wrapper. Why `placement-map.md` lists `containers/` as having no home here. (Medium blocks automated fetches; the retraction is verifiable via the next source.)
- [Container/Presentational Pattern](https://www.patterns.dev/react/presentational-container-pattern/) — patterns.dev (Lydia Hallie / Addy Osmani). Machine-verifiable secondary: modern React "strongly favors Hooks over container components."

### Where business logic belongs

- [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) — React team. If a function calls a Hook it must be a Hook; name custom Hooks for the concrete use case (`useChatRoom`), not the lifecycle (`useMount`, `useEffectOnce`). Source of two rows in §6.
- [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) — React team. The relocation table for logic currently in Effects: derive during render, handle events in handlers, reset via `key`. Behind §6's "a `useEffect` that only computes a value" signal.
- [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) — React team. Avoid redundant and duplicated state; make contradictory states unrepresentable.
- [Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react) — Kent C. Dodds, 2020-07-21. Local → colocate → lift → Context; server cache is a separate concern. Behind §7's table.
- [Hexagonal-Inspired Architecture in React](https://alexkondov.com/hexagonal-inspired-architecture-in-react/) — Alex Kondov, 2022-11-30. Custom hooks as ports: hooks hide endpoints, request logic and DTO→domain mapping; components only render and raise events.
- [Tao of Node](https://alexkondov.com/tao-of-node/) — Alex Kondov, 2022-03-14. The transport / service / repository split, and the distinction between genuine utilities and business-specific logic. Transfers to `api.ts` / `hooks/` / `lib/`.
- [Presentation Domain Data Layering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html) — Martin Fowler, 2015-08-26. Why domain logic must not live in presentation code — **and the caveat this skill follows**: do *not* make presentation/domain/data the top-level split; "split your top level into domain oriented modules which are internally layered." This is why §1 layers by role within a feature-first tree rather than adding `domain/` and `infrastructure/` roots.
- [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) — Robert C. Martin, 2012-08-13. The Dependency Rule: source dependencies point only inward. Noted here because the frontend "clean architecture" genre usually skips Fowler's caveat above; the two are in genuine tension and this skill sides with Fowler.

### Server state vs. UI state

- [Does TanStack Query replace Redux, MobX or other global state managers?](https://tanstack.com/query/latest/docs/framework/react/guides/does-this-replace-client-state) — TanStack. Once server-derived data moves to Query, the remaining client state is "usually very tiny" — often too small to justify a store. The direct argument for §7's "no global store."
- [React Query as a State Manager](https://tkdodo.eu/blog/react-query-as-a-state-manager) — TkDodo, 2021-08-20. Copying query results into `useState`/Redux/Context breaks background revalidation, refetch-on-focus and dedupe; the lever for over-refetching is `staleTime`, not mirroring.
- [RTK Query: Comparison with Other Tools](https://redux-toolkit.js.org/rtk-query/comparison) — Redux team. The Redux team's own position that server cache deserves a purpose-built layer rather than hand-rolled slices.
- [Redux Style Guide: Best Practices](https://redux.js.org/style-guide/) — Redux team. Feature folders with single-file logic; keep state minimal and derive the rest; organize state by data type, not by screen. Retained as the counterfactual: if this app ever needs a store, this is the shape.
- [Structuring Reducers](https://redux.js.org/usage/structuring-reducers/structuring-reducers) — Redux team.
- [Slices Pattern](https://zustand.docs.pmnd.rs/learn/guides/slices-pattern.html) — Zustand (pmndrs). Slice factories composed into one bounded store; middleware only at the store level.
- [Working with Zustand](https://tkdodo.eu/blog/working-with-zustand) — TkDodo, 2022-11-20. Prefer several small stores; export atomic selector hooks, never the raw store. Also: most app state is server or URL state, so little should land in a store at all.
- [Composing Atoms](https://jotai.org/docs/guides/composing-atoms) — Jotai (pmndrs). Keep base atoms private; export only derived read atoms and write-only action atoms.

### Constants, enums and the utils dumping ground

- [The Utility Module Antipattern](https://www.yanglinzhao.com/posts/utils-antipattern/) — Yanglin Zhao, 2020-05-19. "`util` is just too loose of a name; it gives no guidance about what should or should not belong in it." The source of §8's rule that `src/lib/` modules are named for the concept.
- [Dunghill Anti-Pattern: Why Utility Classes and Modules Smell](https://mattilehtinen.com/articles/dunghill-anti-pattern-why-utility-classes-and-modules-smell/) — Matti Lehtinen, 2023-09-05. Names the meaningless module names to avoid (`utils`, `helpers`, `common`, `misc`, `shared`) and prescribes feature-adjacent placement first.
- [Enums (TypeScript Handbook)](https://www.typescriptlang.org/docs/handbook/enums.html) — Microsoft. The official recommendation is now `as const` objects plus a derived union over `enum`.
- [TypeScript 5.8 — `erasableSyntaxOnly`](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html) — Microsoft. Under type-stripping runtimes `enum` is unavailable outright.
- [`no-magic-numbers`](https://typescript-eslint.io/rules/no-magic-numbers/) — typescript-eslint. The lintable form of "name your constants," if `client/` ever gains an ESLint config.

### DTO ↔ domain mapping

- [Anti-Corruption Layer Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer) — Microsoft Azure Architecture Center (Eric Evans' pattern). The translation boundary holds *only* translation — no business rules, no orchestration. Why `placement-map.md` puts DTO→display mapping in `helpers.ts` / `src/lib/`, never inline in JSX.

### Next.js App Router organization

- [Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) — Vercel, updated 2026-07-21. Next.js is explicitly unopinionated; three sanctioned strategies including "split by feature or route." Documents private `_folder`s (what makes `_components/` colocation safe), route groups, and `src/`.
- [Project Organization and File Colocation](https://nextjs.org/docs/14/app/building-your-application/routing/colocation) — Vercel, Next.js 14 docs. The v14-era wording, still live, plus the module-path-aliases section the v16 page dropped.
- [src Folder](https://nextjs.org/docs/app/api-reference/file-conventions/src-folder) — Vercel.
- [Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups) — Vercel. Why `(group)` is for URL-neutral routing organization and `_folder` is for colocation — they are not interchangeable.
- [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) — Vercel, updated 2026-08-25. `'use client'` is a boundary in the module graph; mark specific interactive components, not large regions; pass Server Components as `children`; render providers as deep as possible.
- [The Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary) — Vercel. "Code crosses through imports, data crosses through props." The clearest statement of the §3 boundary rule.
- [use client](https://nextjs.org/docs/app/api-reference/directives/use-client) — Vercel. "You do not need to add the `'use client'` directive to every file that contains Client Components."
- [Common mistakes with the Next.js App Router](https://vercel.com/blog/common-mistakes-with-the-next-js-app-router-and-how-to-fix-them) — Lee Robinson, 2024-01-08. Providers as separate client components accepting `children`; place `'use client'` strategically rather than scattering it.
- [Component Architecture for React Server Components](https://aurorascharff.no/posts/component-architecture-for-react-server-components/) — Aurora Scharff, 2026-05-22. "Pages are synchronous compositors"; client components as leaf nodes. Behind §3's framing of `page.tsx` as entry-or-compositor. Its RSC-fetching half does not apply to this app — see the client-heavy note above.
- [Where Should I Put My Components In The App Router?](https://www.pronextjs.dev/where-should-i-put-my-components-in-the-app-router) — Jack Herrington. The hybrid this repo uses: globally reusable components in `src/components`, route-specific ones in `app/<route>/_components/`. Also honest that the community has not converged. **Where this skill disagrees:** Herrington advises against a folder per component; this repo already uses `<Name>/<Name>.tsx` + `index.ts` consistently, and consistency wins over the preference.
- [Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data) — Vercel. "Keep the preload function next to the component that consumes the data" — colocation applied to data access.
- [How to use Next.js as a backend for your frontend](https://nextjs.org/docs/app/guides/backend-for-frontend) — Vercel. Route Handlers vs. Server Actions. Context for why this app's separate Fastify API is a deliberate architecture rather than a missing layer.

### Server Actions, DAL and data security

Not used by `client/` today — data goes through the Fastify API. Retained because
they are the reference for where server-side logic would go if that changes.

- [use server](https://nextjs.org/docs/app/api-reference/directives/use-server) — Vercel. File-level `'use server'` in a dedicated `actions.ts`; "design your data access functions as secure primitives."
- [Mutating Data](https://nextjs.org/docs/app/getting-started/mutating-data) — Vercel.
- [Server Actions and Mutations](https://nextjs.org/docs/app/guides/server-actions) — Vercel. Actions dispatch sequentially per client; Zod validates shape, not ownership.
- [How to think about data security in Next.js](https://nextjs.org/docs/app/guides/data-security) — Vercel. The Data Access Layer: server-only, authorization-checking, returning minimal DTOs. Pick one of External API / DAL / component-level access — don't mix.
- [How to Think About Security in Next.js](https://nextjs.org/blog/security-nextjs-server-components-actions) — Sebastian Markbåge, 2023-10-23. The original DAL/DTO essay.
- [How to implement authentication in Next.js](https://nextjs.org/docs/app/guides/authentication) — Vercel. Gives the DAL a concrete location (`app/lib/dal.ts`); auth checks in layouts are unsafe.

### Enforcing boundaries mechanically

Not wired up in `client/` (no ESLint config). Listed as the options if §1's layer
map is ever promoted from a review rule to a build rule.

- [`import/no-restricted-paths`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md) — eslint-plugin-import. The lowest-friction option; zones of `target` / `from` / `except`. Exactly what Bulletproof React uses.
- [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) — Javier Brea. Classifies files into element types by path pattern, then enforces allow/deny policies; adds `entry-point` (forces imports through a public barrel) and `external` rules.
- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) — Sander Verweij. Validates *and visualizes* the graph outside ESLint; regex group capture forbids all cross-feature imports in one rule ([rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)).
- [Enforce Module Boundaries](https://nx.dev/features/enforce-module-boundaries) — Nx. Tag-based constraints at package granularity.
- [Structuring a repository](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository) — Turborepo. `apps/` + `packages/`, avoid reaching across package boundaries with `../`. Relevant to the vendored `@devdigest/ui` / `@devdigest/shared` boundary.
