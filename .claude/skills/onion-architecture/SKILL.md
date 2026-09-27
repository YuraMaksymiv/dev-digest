---
name: onion-architecture
version: 1.0.0
description: "Onion / ports-and-adapters architecture for DevDigest's backend (server/ and reviewer-core/): Fastify 5, Drizzle 0.38, Zod 3, Vitest. Decides which layer a piece of backend code belongs to and which way its dependencies may point — routes vs service vs repository vs adapter vs port vs composition root. Use this skill whenever adding, moving or reviewing anything under server/src or reviewer-core/src — including when the user only says 'add an endpoint', 'add a module', 'where should this query go', 'this route is getting long', 'wire up a new adapter', 'add a background job', or 'refactor this service' — and before creating any new file in server/src. Covers the repository boundary over Drizzle, transaction/Unit-of-Work placement, Zod at the HTTP edge, port definition and injection through the Container, and the mechanical dependency-direction check (`pnpm --dir server arch`)."
metadata:
  tags: architecture, onion, hexagonal, ports-and-adapters, dependency-inversion, fastify, drizzle, backend, server
---

# Onion Architecture — `server/` and `reviewer-core/`

Layer placement and dependency direction for the backend. This skill answers
**"which layer does this belong to, and what may it import?"**

The architecture already exists in this repo — `modules/repos/*` is the worked
reference. This skill names it, closes the drift, and makes the rule mechanical.

## Scope, and what this skill does NOT own

| Question | Owner |
|---|---|
| Which layer code belongs to; which way imports may point | **this skill** |
| Fastify route/plugin/hook mechanics, error handling, lifecycle | `fastify-best-practices` |
| Drizzle query syntax, relations, migrations | `drizzle-orm-patterns` |
| Table design, indexing, constraints | `postgresql-table-design` |
| Schema authoring, refinement, inference | `zod` |
| Authn/authz correctness, injection, secrets | `security` |
| Frontend placement (the mirror of this skill) | `frontend-ui-architecture` |

## Reference files

- [`stack-mapping.md`](stack-mapping.md) — each rule expressed in Fastify /
  Drizzle / Zod / Vitest mechanics. Open it when you need the *how*.
- [`tradeoffs.md`](tradeoffs.md) — the two decisions where credible sources
  disagree (repository over an ORM; Unit-of-Work typing), and what we chose.
  Open it before arguing with a rule.
- [`migration-playbook.md`](migration-playbook.md) — bringing a non-conforming
  module up, worked on `pulls`. Open it when a module has no service layer.
- [`README.md`](README.md) — version, changelog, and every source these rules
  are drawn from.

---

## 1. The one rule

**Dependencies point inward. Nothing inner ever names a concrete outer thing.**

```
transport      modules/<m>/routes.ts          Fastify lives here and nowhere else
     ↓
application    modules/<m>/service.ts         orchestration; owns the transaction boundary
     ↓
domain         modules/<m>/helpers.ts         pure; reviewer-core/ for the review engine
     ↓ depends on              ↑ implements
ports          vendor/shared/adapters.ts      + module facades in modules/<m>/types.ts
                                              ↑
adapters       src/adapters/*                 modules/<m>/repository.ts
composition    platform/container.ts, app.ts  the ONLY place a concrete is named
```

Read the diagram as Palermo does: an outer layer may call *any* inner layer
directly, not only the one beneath it. What is forbidden is the reverse — and
naming a concrete implementation anywhere but the composition root.

The payoff is his fourth tenet, and it is the thing worth protecting: **the
application core compiles and runs with no infrastructure present.**
`reviewer-core/` already satisfies this literally — its only imports are
`@devdigest/shared`, `zod` and `openai`.

## 2. Two places a port may live

Both are already in use; pick by who owns the contract.

| Port kind | Home | Example |
|---|---|---|
| Cross-cutting infrastructure | `src/vendor/shared/adapters.ts` | `LLMProvider`, `GitHubClient`, `GitClient`, `SecretsProvider` |
| One module's facade over its own complexity | `src/modules/<m>/types.ts` | `RepoIntel` — hides ast-grep, dependency-cruiser, graphology |

A port is an interface **the inner layer owns**. If you find yourself adding a
method because one adapter happens to support it, the port has become a
description of the adapter and has stopped doing its job.

Note `src/vendor/shared/` is a mirrored copy that can drift from `client/`'s.
For backend ports the **server's** copy is authoritative.

## 3. Module anatomy

```
src/modules/<domain>/
  routes.ts        Fastify plugin. Transport only: parse, map status codes, delegate.
  service.ts       Orchestration. No HTTP, no SQL. Owns the transaction boundary.
  repository.ts    The only file that knows the persistence model.
                   Split to repository/<entity>.repo.ts when it grows.
  helpers.ts       Pure functions. No I/O, no DB, no container, no node builtins.
  constants.ts     Literals this module owns.
  types.ts         The module's facade port, when it has one.
```

Not every module needs every file — see §7.

`modules/repos/*` is the reference: 48-line `routes.ts`, a `service.ts` whose
docstring states the rule, a `repository.ts` taking `Db`.

## 4. The rules

Each is checked by `pnpm --dir server arch` unless marked *(review)*.

1. **Only `repository.ts` / `repository/*.repo.ts` may import `db/schema`,
   `db/rows`, or `drizzle-orm`.** A route or service that queries directly has
   no seam to test against and pins the application layer to Postgres.
2. **Modules depend on ports, never on `src/adapters/*`.** Import the interface,
   resolve the implementation from the Container.
3. **Fastify appears only at the transport edge** — `app.ts`, `server.ts`,
   `modules/index.ts`, `modules/<m>/routes.ts`, `_shared/context.ts`.
4. **Only the composition root names a concrete.** `platform/container.ts` and
   `app.ts` construct adapters; nothing else does.
5. **`helpers.ts` is pure.** No DB, no adapters, no container, no `node:`.
6. **No dependency cycles.** A cycle means the boundary is not real.
7. **Repositories return contract types, not `$inferSelect` rows.** *(review)*
   The row shape is the persistence model; letting it into a service means a
   column rename becomes an application-layer change. Map at the repository edge.
8. **The service owns the transaction.** *(review)* Repositories accept an
   optional `tx` and use it when given. See [`stack-mapping.md`](stack-mapping.md) §3.
9. **`reviewer-core/` stays infrastructure-free.** *(review)* Only contracts,
   `zod`, and the injected `LLMProvider`. Its `src/llm/` adapter is re-exported
   by the barrel but never imported by the pure pipeline — keep it that way.

## 5. The decision procedure

Given a new piece of backend code, stop at the first match:

1. **Does it read `req`/`reply`, set a status code, or define a schema for the
   wire?** → `routes.ts`. Nothing else goes there.
2. **Does it run SQL?** → the module's `repository.ts`. It takes `Db` (or `DbOrTx`),
   returns contract types.
3. **Does it call an external system** (LLM, GitHub, git, filesystem)? → behind a
   port. Implementation in `src/adapters/<system>/`, interface in
   `vendor/shared/adapters.ts`, construction in `platform/container.ts`.
4. **Is it pure — same input, same output, no I/O?** → `helpers.ts`. If it is
   part of the review pipeline itself, it belongs in `reviewer-core/`.
5. **Does it coordinate several of the above** (fetch, decide, persist, emit)?
   → `service.ts`. This is also where a transaction opens.
6. **Is it cross-cutting infrastructure** (jobs, SSE, config, resilience,
   errors)? → `src/platform/`.
7. **Is it wiring?** → `platform/container.ts`.

## 6. Adding a new module — the recipe

1. `src/db/schema/<domain>.ts` → `pnpm db:generate` → `pnpm db:migrate`.
   Never hand-edit a generated migration.
2. `modules/<domain>/repository.ts` — `constructor(private db: Db)`, returns
   contract types.
3. `modules/<domain>/service.ts` — orchestration, depends on ports.
4. `modules/<domain>/routes.ts` — Fastify plugin, `withTypeProvider<ZodTypeProvider>()`,
   delegates to the service.
5. Register in `modules/index.ts` — one import, one entry.
6. New external system → port in `vendor/shared/adapters.ts`, adapter in
   `src/adapters/`, wiring + `ContainerOverrides` entry in `platform/container.ts`.
7. Tests: pure logic in `test/<domain>-*.test.ts` (no mocks needed);
   DB-touching in `test/<domain>.it.test.ts` via Testcontainers.
8. `pnpm --dir server arch` must pass.

## 7. When NOT to add layers

Over-applying this is a real failure mode, so it is a rule too.

- **A module with no orchestration does not need a service.** `workspace/routes.ts`
  is 34 lines. A Transaction Script in the route is the right pattern there;
  what it still must not do is spread SQL across several handlers.
- **Do not create an interface with one implementation and no test seam.**
  If you cannot imagine a second implementation *or* a fake worth injecting,
  you have added indirection, not an abstraction.
- **Do not promote `domain/`, `application/`, `infrastructure/` to top-level
  folders.** The top-level split here is `modules/<domain>/`, layered internally.
  That is deliberate — see [`tradeoffs.md`](tradeoffs.md) §3.
- **Do not refactor a conforming module to chase purity.** Fix drift when you are
  already touching the module; the `arch` baseline stops it from growing.

## 8. Mechanical check

```bash
pnpm --dir server arch
```

Enforced by `dependency-cruiser` (already a dependency — no new tooling) via
`server/.dependency-cruiser.cjs`.

- `arch` — fails on **new** violations only. This is the gate.
- `arch:all` — shows everything, including the 26 known ones.
- `arch:baseline` — re-records the baseline. Only ever run this to *lower* the
  count. Re-recording to silence a violation you just introduced defeats the gate.

`dependency-cruiser` also catches transitive violations and cycles, which a
per-file lint cannot see.

## 9. Known drift

26 violations are recorded in the baseline. They are real, not false positives.

| Rule | Count | Where |
|---|---|---|
| `only-repositories-touch-db` | 10 | `pulls`, `settings`, `polling`, `workspace` routes; `reviews/{service,run-executor,diff-loader}`; `repos/helpers` |
| `modules-use-ports-not-adapters` | 8 | `repo-intel/{service,pipeline/*}`, `reviews/diff-loader` |
| `no-circular` | 5 | `container ↔ repo-intel/service`; `agents/helpers ↔ agents/repository` |
| `adapters-do-not-depend-on-features` | 2 (warn) | `astgrep`, `depgraph` → `repo-intel/constants` |
| `helpers-are-pure` | 1 | `repos/helpers` |

Two of these deserve attention beyond architecture hygiene:

- **The `container ↔ repo-intel/service` cycle is the service-locator problem
  made visible.** Services take the whole `Container`; the Container constructs
  the services. Narrowing a service's constructor to the ports it actually uses
  breaks the cycle. See [`tradeoffs.md`](tradeoffs.md) §2.
- **There are zero transactions in `src/`.** `repo-intel/repository.ts`
  `replaceEdges` / `replaceFileRank` / `replaceFileFacts` each `delete` then
  chunk-`insert` with no transaction — a crash mid-way leaves the index empty.
  That is a correctness bug, not a style issue. See [`stack-mapping.md`](stack-mapping.md) §3.

## 10. Review checklist

- [ ] Does any import point outward, or name a concrete outside the composition root?
- [ ] Is `routes.ts` transport only — parse, delegate, map status?
- [ ] Does anything outside `repository*` import `db/schema`, `db/rows`, or `drizzle-orm`?
- [ ] Does a repository return a `$inferSelect` row to a service?
- [ ] Does a service import Fastify, `node:`, or a concrete adapter?
- [ ] Is `helpers.ts` still pure?
- [ ] Does a multi-statement write run without a transaction?
- [ ] Is a new external call behind a port, with a `ContainerOverrides` entry so tests can fake it?
- [ ] New interface — does it have a second implementation or a fake worth injecting?
- [ ] Does `pnpm --dir server arch` pass?
