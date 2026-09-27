# Stack mapping — the rules in Fastify / Drizzle / Zod / Vitest

How each layer rule is actually expressed in the tools this repo uses. Read
[SKILL.md](SKILL.md) first for *which* layer; this file is the *how*.

## Contents

1. [Fastify: the transport edge](#1-fastify-the-transport-edge)
2. [Zod: parsing at the boundary](#2-zod-parsing-at-the-boundary)
3. [Drizzle: repositories and the transaction boundary](#3-drizzle-repositories-and-the-transaction-boundary)
4. [Ports and the Container](#4-ports-and-the-container)
5. [Testing each layer](#5-testing-each-layer)

---

## 1. Fastify: the transport edge

Fastify itself prescribes **no folder structure** — its docs give only a load
order (ecosystem plugins → your plugins → decorators → hooks → services), and the
team's own reference app has no `services/` at all. So this skill is prescribing
more than Fastify does. That is deliberate: our modules carry real orchestration,
and the reference app's decorator-based style does not scale to that.

**A route handler does four things and no more:** resolve context, validate via
schema, call one service method, map the result to a status code.

```ts
// modules/repos/routes.ts — the shape to copy
export default async function reposRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new RepoService(app.container);

  app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    const { repo, created } = await service.add(workspaceId, userId, req.body.url);
    reply.status(created ? 201 : 200);
    return repo;
  });
}
```

Mechanics worth knowing:

- **`withTypeProvider<ZodTypeProvider>()` must be re-invoked in every
  encapsulated plugin scope.** Type-provider information does not cross an
  encapsulation boundary — a trap when routes are split per module.
- **Don't use arrow functions as handlers.** Fastify binds `this` to the instance.
- Cross-cutting work belongs in `preHandler` / `preValidation` hooks, not in the
  handler body.
- **Fastify encapsulation is already a DI mechanism**: a child context reads the
  parent's decorators, never the reverse. `app.container` is decorated once at
  the root; that is why every module can reach the composition root without
  importing it.
- `fastify.decorate(name, value, [dependencies])` validates its dependency list
  **at boot**, not at first request — use it when adding a new decorator.

**Background jobs are a second driving adapter.** `platform/jobs.ts` (`JobRunner`)
drives services exactly as HTTP does. A job handler obeys the same rule as a
route handler: thin, delegates to a service. `modules/repos/service.ts`
`registerCloneJobHandler()` is the pattern.

## 2. Zod: parsing at the boundary

The contract schemas live in `@devdigest/shared`; `fastify-type-provider-zod` is
already wired in `app.ts` (`validatorCompiler` + `serializerCompiler`).

The architectural point is *parse, don't validate*: unvalidated wire input is
turned into a typed value **once, at the edge**, and everything behind the
boundary works with the parsed type. Validation smeared through the service layer
("shotgun parsing") means invalid input has already been partly acted on before
anyone notices.

The limit that creates a layer: **Fastify's docs say schemas are for shape and
type, not security or business rules.** A schema proves `prId` is a uuid. It
cannot prove the caller may see that PR. Ownership and invariants are the
service's job — which is exactly why the boundary and the domain are different
layers.

Where each belongs:

| Concern | Layer | Mechanism |
|---|---|---|
| Shape, type, coercion | transport | route `schema: { body, params, querystring, response }` |
| Value invariants worth encoding in the type | boundary | `.refine()`, `.brand<"…">()` |
| Ownership / authorization | application | service, after `getContext()` |
| Cross-entity consistency | application | service, inside a transaction |

Version note: `fastify-type-provider-zod` v4.x targets Zod 3 (what we run);
v5–6 target Zod 4; v7+ needs Zod ≥4.2 and serializes the post-transform output
type. Don't bump it casually.

## 3. Drizzle: repositories and the transaction boundary

### The repository boundary

Drizzle's maintainers state the core is deliberately **not** a repository layer
and will not grow one. So our `repository.ts` is not "an abstraction over the
ORM" — it is the seam that keeps the persistence model out of the application
layer. That is a narrower claim, and it is the one we can defend.
See [tradeoffs.md](tradeoffs.md) §1.

Practical consequence — derive row types at the adapter edge and map there:

```ts
// repository.ts — the row shape stops here
type RepoRow = typeof t.repos.$inferSelect;

export class RepoRepository {
  constructor(private db: DbOrTx) {}

  async byId(workspaceId: string, id: string): Promise<Repo | null> {
    const [row] = await this.db.select().from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, id)));
    return row ? toRepoDto(row) : null;   // contract type out, not RepoRow
  }
}
```

A service receiving `Repo` (the contract) instead of `RepoRow` is unaffected by a
column rename. Today `reviews/service.ts` imports `db/rows.ts` — that is drift
item 2 in [SKILL.md](SKILL.md) §9.

### The transaction boundary

There are **zero** `.transaction(` calls in `src/` today. Adopt this shape:

```ts
// db/client.ts — add these two
export type Tx     = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;
```

The `Parameters<…>` derivation is the version-proof form: `PgTransaction` is no
longer reliably exported from `drizzle-orm/pg-core`.

Then: **repositories accept `DbOrTx`; the service opens the transaction.**

```ts
// service.ts — the application layer owns the unit of work
async reindex(repoId: string, data: IndexPayload): Promise<void> {
  await this.db.transaction(async (tx) => {
    const repo = new RepoIntelRepository(tx);
    await repo.replaceEdges(repoId, data.edges);
    await repo.replaceFileRank(repoId, data.rank);
    await repo.replaceFileFacts(repoId, data.facts);
  });
}
```

This is Service Layer's defining responsibility — "controls transactions and
coordinates responses" — and it fixes a real bug: `repo-intel/repository.ts`
currently does `delete` then chunked `insert` in three separate methods with no
transaction, so a crash mid-way leaves the index empty rather than stale.

Nested `tx.transaction(...)` maps to SAVEPOINTs when partial rollback is needed.
`tx.rollback()` aborts on a business-rule failure. Postgres accepts a second
`PgTransactionConfig` argument for `isolationLevel` / `accessMode`.

A fully abstract `ITransactionManager` port — so the domain never sees a Drizzle
type at all — is the purer option and we did **not** take it; the reasoning is in
[tradeoffs.md](tradeoffs.md) §2.

### Migrations

Schema-first, always: edit `src/db/schema/*`, run `pnpm db:generate`, review the
SQL, `pnpm db:migrate`. Applied migrations are immutable — a correction is a new
migration. Never hand-edit a file under `src/db/migrations/`, including
`meta/_journal.json` and snapshots.

## 4. Ports and the Container

`platform/container.ts` is the composition root — "a single location where
modules are composed together, as close as possible to the entry point". Two
rules follow from that definition and both matter here:

- Only an **application** has a composition root. `reviewer-core/` is a library:
  it must never construct its own `LLMProvider`, only receive one.
- The container is referenced **from the root**, and application code receives
  what it needs. Querying the container for dependencies from deep inside a
  service is Service Locator, not injection.

That second rule is where we currently drift: all four services take
`constructor(private container: Container)`. It is why `arch` reports a cycle
between `container.ts` and `repo-intel/service.ts`. The fix is mechanical and
incremental — narrow each constructor to the ports it actually uses:

```ts
// before — the whole container, resolved lazily, cycle included
constructor(private container: Container) {}

// after — the ports this service actually needs
constructor(
  private repo: ReviewRepository,
  private agents: AgentsRepository,
  private llm: (id: ProviderId) => Promise<LLMProvider>,
  private bus: RunBus,
) {}
```

Repositories already do this correctly (`constructor(private db: Db)`).

**Adding a new external system:**

1. Interface → `src/vendor/shared/adapters.ts` (or `modules/<m>/types.ts` for a
   module facade).
2. Implementation → `src/adapters/<system>/<impl>.ts`.
3. Field + lazy getter → `platform/container.ts`.
4. Entry in `ContainerOverrides` so tests can inject a fake. This is not
   optional — it is the port's reason for existing.

**We use Pure DI, not a container library**, and that is a deliberate choice: a
DI container pays off only with convention-over-configuration, and `tsyringe`
would need `reflect-metadata` plus decorator metadata, which conflicts with
running TypeScript directly under `tsx`. Revisit around 20–30+ services.

## 5. Testing each layer

The layering exists to make this table possible. Mock **unmanaged** dependencies
(LLM, GitHub — their interactions are observable behavior); use the **real**
managed one (our Postgres — its interactions are implementation detail).

| Layer | Test style | Doubles | Where |
|---|---|---|---|
| `reviewer-core/`, `helpers.ts` | call the function, assert the output | **none** | `test/*.test.ts` |
| `service.ts` | inject fake ports via `ContainerOverrides` | fakes for LLM/GitHub/git | `test/*.test.ts` |
| `repository.ts` | real Postgres | none | `test/*.it.test.ts` |
| `routes.ts` | `buildApp({ overrides })` + `app.inject()` | fakes for unmanaged ports | `test/*.it.test.ts` |

This already works — `buildApp({ config, db, overrides: { github: gh } })` is the
established pattern across `test/`.

Two consequences worth stating, because they are the *point* of the architecture:

- **A pure layer needs no test doubles at all.** If testing a piece of domain
  logic requires mocking something, that logic is in the wrong layer. Reach for
  a fake only for a genuinely awkward collaborator.
- **Mock-verification tests couple to implementation detail** and break on
  refactoring. Prefer asserting on returned values; that is available precisely
  because the core is pure.

Mechanics: Testcontainers' `@testcontainers/postgresql` with
`snapshot()`/`restoreSnapshot()` is far cheaper than restarting the container
between tests — but never name the test database `postgres` or snapshots break.
Vitest's `test.projects` is the supported way to split fast domain tests from
container-backed ones (`workspace` has been deprecated since 3.2); today we split
by filename (`.it.test.ts`) instead, which is fine and simpler.
