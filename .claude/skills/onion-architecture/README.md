# onion-architecture

**Version 1.0.0** · scope: `server/` (`@devdigest/api`) + `reviewer-core/` · last reviewed 2026-09-21

Onion / ports-and-adapters layering for the DevDigest backend, expressed in the
tools this repo actually uses: Fastify 5, Drizzle 0.38, Zod 3, Vitest,
Testcontainers. The skill answers **which layer code belongs to and which way its
dependencies may point**, and ships a mechanical check for it.

## Files

| File | Purpose | Read when |
|---|---|---|
| [`SKILL.md`](SKILL.md) | Layer map, the 9 rules, decision procedure, review checklist | Always — it's the skill body |
| [`stack-mapping.md`](stack-mapping.md) | Each rule in Fastify / Drizzle / Zod / Vitest mechanics | You need the *how* |
| [`tradeoffs.md`](tradeoffs.md) | The contested decisions and what we chose | Before arguing with a rule |
| [`migration-playbook.md`](migration-playbook.md) | Bringing a non-conforming module up, worked on `pulls` | A module has no service layer |
| `README.md` | This file: scope, enforcement, version, sources | Deciding whether to change the skill |

Enforcement lives in the server package, where it runs:
[`server/.dependency-cruiser.cjs`](../../../server/.dependency-cruiser.cjs) and
`server/.dependency-cruiser-known-violations.json`.

## Enforcement

```bash
pnpm --dir server arch            # fails on NEW violations only — the gate
pnpm --dir server arch:all        # everything, including the 26 known
pnpm --dir server arch:baseline   # re-record the baseline (only to lower it)
```

`dependency-cruiser@17.4.3` was **already a `server/` dependency** (used by
`adapters/depgraph` to analyse indexed repos), so enforcement cost zero new
packages. It cruises 149 modules / 463 dependencies in seconds, and catches
transitive violations and cycles that a per-file lint cannot see.

Eight rules are checked; six are `error`, one is `warn`, and three rules in
`SKILL.md` are review-only because they are not expressible as import edges
(repositories returning contract types, transaction placement, core purity).

**Baseline:** 26 existing violations are recorded so new code is clean without a
big-bang refactor. They are real findings, not false positives — `SKILL.md` §9
lists them. Verified during setup: with the baseline in place a freshly
introduced violation is still caught immediately.

## Why this is DevDigest-specific

The architecture was already here and unnamed; this skill names it rather than
importing one. Load-bearing local facts:

- Ports already exist in `server/src/vendor/shared/adapters.ts` — 28 interfaces,
  with the rule stated in the file: "ALL external calls go behind these interfaces."
- `reviewer-core/` is already a pure core: its only imports are
  `@devdigest/shared`, `zod`, `openai` — no `node:`, no DB, no Fastify.
- `platform/container.ts` is already a composition root with `ContainerOverrides`
  for tests, and `buildApp({ overrides })` is the established test pattern.
- `modules/repos/*` is the reference implementation, docstring included.
- Fastify is already confined to `app.ts`, `server.ts`, `modules/index.ts`,
  `modules/<m>/routes.ts`, `_shared/context.ts`.
- There is **no ESLint anywhere in the repo**, which is why enforcement is
  `dependency-cruiser` rather than an ESLint rule.
- The measured drift (§9 of `SKILL.md`) is what the rules are aimed at — including
  one correctness bug: zero `.transaction(` calls in `src/`.

## Changelog

### 1.0.0 — 2026-09-21

Initial version. Layer map and the inward-dependency rule; the two port
locations; module anatomy; 9 rules (6 mechanically checked); 7-step decision
procedure; new-module recipe; explicit "when not to add layers"; mechanical check
via `dependency-cruiser` with a 26-entry baseline; review checklist. Plus
`stack-mapping.md`, `tradeoffs.md`, and a `pulls`-worked `migration-playbook.md`.

Shipped alongside: `server/.dependency-cruiser.cjs`,
`server/.dependency-cruiser-known-violations.json`, and the `arch` / `arch:all` /
`arch:baseline` scripts in `server/package.json`.

---

## Sources

All URLs fetched and verified 2026-09-20.

### Onion Architecture — primary

- [The Onion Architecture : part 1](https://jeffreypalermo.com/blog/the-onion-architecture-part-1/) — Jeffrey Palermo, 2008-07-29. "All code can depend on layers more central, but code cannot depend on layers further out from the core." Repository *interfaces* sit in the first ring. "The database is not the center. It is external."
- [part 2](https://jeffreypalermo.com/blog/the-onion-architecture-part-2/) — 2008-07-30. The controller depends only on interfaces *defined in the application core*, implemented outside it.
- [part 3](https://jeffreypalermo.com/blog/the-onion-architecture-part-3/) — 2008-08-04. The four tenets, including the one this skill makes mechanical: **the application core compiles and runs separately from infrastructure.** Also the rule that distinguishes Onion from n-tier: any outer layer may call any inner layer directly.
- [part 4 — After Four Years](https://jeffreypalermo.com/blog/onion-architecture-part-4-after-four-years/) — 2013-08-19. "Onion architecture works just fine without the likes of StructureMap or Castle Windsor" — the basis for our Pure DI choice.

### Hexagonal / Clean / DDD

- [Hexagonal Architecture (Ports & Adapters)](https://alistair.cockburn.us/hexagonal-architecture/) — Alistair Cockburn, v0.9 2005, maintained. "Create your application to work without either a UI or a database so you can run automated regression-tests." Primary (driving) vs secondary (driven) actors — why HTTP routes and the JobRunner are both driving adapters.
- *Hexagonal Architecture Explained* — Cockburn & Garrido de Paz, Humans & Technology Press, 2024, ISBN 9781737519782.
- [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) — Robert C. Martin, 2012-08-13. The Dependency Rule; nothing inner may name anything outer **including data formats** — the direct argument against `$inferSelect` reaching a service.
- [Screaming Architecture](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html) — 2011-09-30. Top-level folders name the domain, not the framework.
- [A Little Architecture](https://blog.cleancoder.com/uncle-bob/2016/01/04/ALittleArchitecture.html) — 2016-01-04. Architecture is what lets you *defer* the DB and framework decisions.
- [PresentationDomainDataLayering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html) — Martin Fowler, 2015-08-26. The caveat behind `tradeoffs.md` §3: don't make layers the top-level split; "split your top level into domain oriented modules which are internally layered."
- [Domain Driven Design](https://martinfowler.com/bliki/DomainDrivenDesign.html) — Fowler, 2020-04-22. · [DDD Reference](https://www.domainlanguage.com/ddd/reference/) — Eric Evans, 2015, CC BY 4.0.

### Supporting patterns (P of EAA)

- [Repository](https://martinfowler.com/eaaCatalog/repository.html) — Hieatt & Mee, 2003. Note its own scope limit: systems with many domain classes or complex querying.
- [Service Layer](https://martinfowler.com/eaaCatalog/serviceLayer.html) — Randy Stafford, 2003. "Controls transactions and coordinates responses" — the basis for rule 8.
- [Unit of Work](https://martinfowler.com/eaaCatalog/unitOfWork.html) — Fowler, 2003.
- [Data Transfer Object](https://martinfowler.com/eaaCatalog/dataTransferObject.html) · [Domain Model](https://martinfowler.com/eaaCatalog/domainModel.html) · [Transaction Script](https://martinfowler.com/eaaCatalog/transactionScript.html) — Fowler, 2003. Transaction Script is the citation behind "a 34-line module doesn't need an onion."
- [AnemicDomainModel](https://martinfowler.com/bliki/AnemicDomainModel.html) — Fowler, 2003-11-25. "The Service Layer is thin."

### Critiques the skill has to answer

- [Architecting in the pit of doom: the evils of the repository abstraction layer](https://ayende.com/blog/4784/architecting-in-the-pit-of-doom-the-evils-of-the-repository-abstraction-layer) — Oren Eini, 2011. Query reuse is a myth; the wrapper hides the ORM's capabilities.
- [You might not need the repository pattern](https://www.jayfreestone.com/writing/you-might-not-need-the-repository-pattern/) — Jay Freestone, 2026-05-23. Names Drizzle/Kysely specifically; concedes three conditions where it *is* worth it.
- [Vertical Slice Architecture](https://www.jimmybogard.com/vertical-slice-architecture/) — Jimmy Bogard, 2018-04-19. "Controller MUST talk to a Service that MUST use a Repository" fits a minority of requests.
- [Better abstractions revisited](https://blog.ploeh.dk/2019/01/28/better-abstractions-revisited/) — Mark Seemann, 2019-01-28. The Composite/Null-Object test for "abstraction or just a test seam" — behind `SKILL.md` §7.
- [Leaky abstraction by omission](https://blog.ploeh.dk/2021/04/26/leaky-abstraction-by-omission/) — Seemann, 2021-04-26.
- [Is Clean Architecture Overengineering?](https://threedots.tech/episode/is-clean-architecture-overengineering/) — Smółka & Laszczak. Overengineering signals: one interface per struct, >4 layers, company-wide mandates.
- [How to implement Clean Architecture in Go](https://threedots.tech/post/introducing-clean-architecture/) — Smółka, 2020-09-01. The constructive counterpart, with its own scope limit.
- [Clean Architecture Sucks](https://ardalis.com/clean-architecture-sucks/) — Steve Smith, 2024-05-23. A faithful catalogue of the real complaints.
- [CUPID](https://dannorth.net/blog/cupid-for-joyful-coding/) — Dan North, 2022-02-10. Properties over principles; the Domain-based property.
- [Yagni](https://martinfowler.com/bliki/Yagni.html) — Fowler, 2015-05-26 (cost of carry) · [Design Stamina Hypothesis](https://martinfowler.com/bliki/DesignStaminaHypothesis.html) — 2007-06-20 (the counterweight).

### Testing

- [Boundaries](https://www.destroyallsoftware.com/talks/boundaries) — Gary Bernhardt, 2012. Functional Core, Imperative Shell — isolated tests *without* test doubles.
- [Functional architecture is Ports and Adapters](https://blog.ploeh.dk/2016/03/18/functional-architecture-is-ports-and-adapters/) — Seemann, 2016-03-18.
- [From dependency injection to dependency rejection](https://blog.ploeh.dk/2017/01/27/from-dependency-injection-to-dependency-rejection/) — Seemann, 2017-01-27.
- [Pragmatic unit testing](https://enterprisecraftsmanship.com/posts/pragmatic-unit-testing/) · [Styles of unit testing](https://enterprisecraftsmanship.com/posts/styles-of-unit-testing/) · [When to Mock](https://enterprisecraftsmanship.com/posts/when-to-mock/) — Vladimir Khorikov. The operational rule in `stack-mapping.md` §5: mock **unmanaged** dependencies (LLM, GitHub), use the **real** managed one (our Postgres).
- [Mocks Aren't Stubs](https://martinfowler.com/articles/mocksArentStubs.html) — Fowler, 2007-01-02. · [Humble Object](https://martinfowler.com/bliki/HumbleObject.html) — Fowler, 2020-04-29.

### Fastify

- [Plugins](https://fastify.dev/docs/latest/Reference/Plugins/) · [Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/) · [Plugins Guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) — Fastify 5.12.5. Encapsulation is a DI mechanism we already use: a child context reads the parent's decorators, never the reverse.
- [Decorators](https://fastify.dev/docs/latest/Reference/Decorators/) — `decorate(name, value, [dependencies])` validates wiring **at boot**.
- [Routes](https://fastify.dev/docs/latest/Reference/Routes/) — don't use arrow functions as handlers; push cross-cutting concerns into hooks.
- [Getting Started](https://fastify.dev/docs/latest/Guides/Getting-Started/) — **Fastify prescribes no folder structure**, only a load order. `stack-mapping.md` §1 says so explicitly.
- [Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/) — type-provider info does **not** cross encapsulation boundaries.
- [Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) — schemas are for shape, **not** security or business rules. The justification for a domain-invariant layer behind the boundary.
- [fastify-plugin](https://github.com/fastify/fastify-plugin) · [fastify-cli](https://github.com/fastify/fastify-cli) (`print-plugins` audits the composition root) · [fastify/demo](https://github.com/fastify/demo) — the team's reference app: `app.ts`, `server.ts`, `plugins/`, `routes/`, `schemas/` and notably **no `services/`**.

### DI in TypeScript

- [Pure DI](https://blog.ploeh.dk/2014/06/10/pure-di/) · [Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/) · [When to use a DI Container](https://blog.ploeh.dk/2012/11/06/WhentouseaDIContainer/) — Mark Seemann. Behind `stack-mapping.md` §4: Service Locator is an anti-pattern when *application* code queries for its dependencies; a container referenced only from the root is fine.
- [awilix](https://github.com/jeffijoe/awilix) v13.0.5 · [tsyringe](https://github.com/microsoft/tsyringe) v4.4.0 — needs `reflect-metadata` and decorator metadata, which conflicts with running TS under `tsx`.
- [Dependency Injection in Node.js & TypeScript](https://thetshaped.dev/p/dependency-injection-in-nodejs-and-typescript-dependency-inversion-part-no-body-teaches-you) — Petar Ivanov, 2026-03-29. Reach for a container only at ~20–30+ services.

### Drizzle

- [Transactions](https://orm.drizzle.team/docs/transactions) — `db.transaction(async tx => …)`, `tx.rollback()`, nested → SAVEPOINTs, `PgTransactionConfig`.
- [Correct TS type for `tx`](https://github.com/drizzle-team/drizzle-orm/discussions/3271) — the `Parameters<Parameters<typeof db['transaction']>[0]>[0]` derivation used in `stack-mapping.md` §3; `PgTransaction` is no longer reliably exported.
- [Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/) — Lazar Nikolov, 2024-10-03. The `ITransactionManagerService` port we considered and did not take (`tradeoffs.md` §2).
- [Possible further abstractions?](https://github.com/drizzle-team/drizzle-orm/discussions/232) — maintainers state Drizzle core is deliberately not a repository layer.
- [Goodies](https://orm.drizzle.team/docs/goodies) — `$inferSelect` / `InferSelectModel` belong at the adapter edge. · [Relational queries](https://orm.drizzle.team/docs/rqb) · [Migrations](https://orm.drizzle.team/docs/migrations) · [drizzle-kit generate](https://orm.drizzle.team/docs/drizzle-kit-generate).

### Zod at the boundary

- [Basics](https://zod.dev/basics) · [API](https://zod.dev/api) — `.brand<"…">()` for nominal types at the edge; `z.input` vs `z.output`.
- [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) — Alexis King, 2019-11-05. Names *shotgun parsing*; push all parsing to the boundary.
- [Parse, Don't Validate in TypeScript](https://cekrem.github.io/posts/parse-dont-validate-typescript/) — Christian Ekrem, 2026-04-07.
- [fastify-type-provider-zod](https://github.com/turkerdev/fastify-type-provider-zod) — already wired in `app.ts`. Version matrix: v4.x→Zod 3 (ours), v5–6→Zod 4, v7+→Zod ≥4.2.

### Testing tools

- [Vitest projects](https://vitest.dev/guide/projects) — `workspace` deprecated since 3.2; `test.projects` is the supported split.
- [Vitest mocking](https://vitest.dev/guide/mocking) · [`vi` API](https://vitest.dev/api/vi.html) — `vi.mock` is hoisted above imports.
- [Testcontainers usage](https://node.testcontainers.org/quickstart/usage/) · [global setup](https://node.testcontainers.org/quickstart/global-setup/) · [postgresql module](https://node.testcontainers.org/modules/postgresql/) — `snapshot()`/`restoreSnapshot()` beats restarting; never name the test DB `postgres`.

### Mechanical enforcement

- [dependency-cruiser rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) — regex `from`/`to`; the onion rule is a documented example; `reachable` catches transitive violations. **What we use.**
- [eslint-plugin-boundaries — dependencies rule](https://www.jsboundaries.dev/docs/rules/dependencies/) v7.1.0 — the alternative if the repo ever adopts ESLint.
- [import/no-restricted-paths](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md) — matches the **resolved** module, so `@devdigest/*` aliases don't defeat it.
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html) — the strongest boundary: the compiler refuses unreferenced imports. · [tsconfig paths](https://www.typescriptlang.org/tsconfig/#paths) — **ergonomics, not enforcement**.
