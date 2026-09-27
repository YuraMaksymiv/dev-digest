# Migration playbook — bringing a module up to the layering

For a module that has `routes.ts` and nothing else. Four such modules exist
today: `pulls`, `settings`, `polling`, `workspace`.

The worked example is **`pulls`** — 405 lines, the largest route file in the
repo, and the one with the most inside it.

## When to do this at all

Not on a schedule. Migrate a module when you are **already changing it** and the
change would otherwise add to the pile. Two exceptions worth doing on their own:

- a module whose route file crosses ~200 lines,
- any `delete`-then-`insert` sequence running without a transaction (a bug, not
  debt — `pulls/routes.ts:263-277` is one).

`workspace/routes.ts` is 34 lines with one query. Leave it alone: a Transaction
Script in the route is the right pattern at that size ([SKILL.md](SKILL.md) §7).

## What `pulls` currently contains

Reading `routes.ts` top to bottom, four separable concerns are interleaved:

| Concern | Evidence | Target layer |
|---|---|---|
| HTTP shape: 5 routes, `IdParams`, status codes | `app.get('/repos/:id/pulls')`, `app.get('/pulls/:id')`, comment routes | stays in `routes.ts` |
| Persistence: ~15 inline queries | `container.db.select/insert/update/delete` at :40, :59, :92, :134, :154, :186, :243, :263-277, :302 | new `repository.ts` |
| Orchestration: GitHub sync, diff-stat backfill, three read-rollups | :59 backfill, :134 latest-review score, :154 findings, :186 runs | new `service.ts` |
| Pure derivations | already extracted | `status.ts` — **leave as is** |

`status.ts` is the part that is already right: `rollupSeverities`,
`toSeverityBreakdown`, `toFindingPreviews`, `deriveReviewStatus` are pure and
unit-tested in `test/pulls-status.test.ts` with no Testcontainers boot. Do not
touch it, and use it as the proof that the rest can be separated too.

## The sequence

Work in this order. Each step leaves the tree green, so the migration can stop
at any point.

### 1. Characterise before moving anything

`pulls` has no route-level test today. Add one first — `buildApp({ overrides })`
+ `app.inject()` against a Testcontainers Postgres, asserting the response bodies
of the two list/detail routes. This is the net under the refactor: everything
after this is behaviour-preserving, and you want a test that proves it.

### 2. Extract `repository.ts`

Move every `container.db.*` call, unchanged, into a class taking `DbOrTx`:

```ts
export class PullsRepository {
  constructor(private db: DbOrTx) {}

  async listByRepo(workspaceId: string, repoId: string): Promise<PullRow[]> { … }
  async replaceFiles(prId: string, files: PrFileInput[]): Promise<void> { … }
}
```

Two rules while moving:

- **Don't redesign the queries.** Same SQL, same order. A behaviour change hidden
  inside a structural refactor is very expensive to find later.
- **Return contract types at the boundary** (`PrMeta`, `PrDetail`), mapping rows
  in the repository. If that is too large a step, return row types first and
  narrow them in a follow-up — but write down that you did.

`reviews/repository/` shows the split-by-aggregate shape once this file grows:
`repository/pull.repo.ts`, `review.repo.ts`, `run.repo.ts`, composed by
`repository.ts`.

### 3. Wrap the non-atomic writes

`routes.ts:263-277` deletes `prFiles` then inserts the new set; `:275-277` does
the same for `prCommits`. A failure between them leaves the PR detail empty.
This is the step that fixes a real bug:

```ts
async replaceDetail(prId: string, files: …, commits: …): Promise<void> {
  await this.db.transaction(async (tx) => {
    const r = new PullsRepository(tx);
    await r.replaceFiles(prId, files);
    await r.replaceCommits(prId, commits);
  });
}
```

See [stack-mapping.md](stack-mapping.md) §3 for the `Tx` / `DbOrTx` aliases this
needs in `db/client.ts`.

### 4. Extract `service.ts`

Move the orchestration: GitHub sync, the diff-stat backfill, the three read-side
rollups. The service depends on the repository plus the `GitHubClient` **port**,
never on Octokit directly.

```ts
export class PullsService {
  constructor(private repo: PullsRepository, private github: () => Promise<GitHubClient>) {}

  async listForRepo(workspaceId: string, repoId: string): Promise<PrMeta[]> {
    // sync from GitHub → persist → rollups via status.ts → PrMeta[]
  }
}
```

Prefer narrow constructor parameters over taking the whole `Container` — that is
what produces the `container ↔ service` cycles `arch` reports elsewhere
([stack-mapping.md](stack-mapping.md) §4).

### 5. Reduce `routes.ts` to transport

What remains should look like `modules/repos/routes.ts`: resolve context,
validate by schema, call one service method, map the status code. Target well
under 100 lines.

### 6. Lower the baseline

```bash
pnpm --dir server arch:all      # confirm the pulls violations are gone
pnpm --dir server arch:baseline # re-record, now with fewer entries
pnpm --dir server typecheck && pnpm --dir server test
```

**Only ever re-record the baseline to lower the count.** Re-recording to silence
something you just introduced defeats the gate.

### 7. Note what you learned

If something non-obvious came up — a query that could not move without changing
behaviour, a rollup that turned out to be load-bearing — append it to
`server/INSIGHTS.md` via the `engineering-insights` skill.

## Expected result for `pulls`

| | before | after |
|---|---|---|
| `routes.ts` | 405 lines, 15 inline queries | < 100, transport only |
| `repository.ts` | — | the only file importing `db/schema` |
| `service.ts` | — | orchestration over ports |
| `status.ts` | pure, tested | unchanged |
| `arch` violations | 1 (`only-repositories-touch-db`) | 0 |
| non-atomic writes | 2 | 0 |

## Order across the four modules

1. **`pulls`** — biggest payoff, and it carries the atomicity bug.
2. **`settings`** — 98 lines; `feature-models.ts` also touches `db/schema`.
3. **`polling`** — 68 lines, one job-ish route.
4. **`workspace`** — 34 lines. Probably leave it; if it ever grows past a single
   query, give it a repository and stop there.
