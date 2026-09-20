# Spec — Run cost attribution (`cost` in the studio UI)

Status: **implemented** (2026-09-16) · Scope: `server/` + `client/` (contracts
in `@devdigest/shared`) · No `reviewer-core/` change required.

## 1. Summary

Surface the USD cost of agent review runs in three places in the studio:

| # | Screen | Where | What |
|---|---|---|---|
| 1 | Pull Requests list | new `COST` column, between `STATUS` and `UPDATED` | summed cost of that PR's completed runs |
| 2 | PR detail → Agent runs → Timeline | right-hand meta column, under the time | `9,119 tok · $0.0013` |
| 3 | PR detail → Agent runs → Review Runs accordion header | between the score badge and the timestamp | `$0.001` |
| 4 | Run Trace drawer → Stats | new 4th tile, between `TOKENS` and `FINDINGS` | `COST` `$0.06` |

The engine **already computes** this number — it is simply discarded today.

## 2. Current state

`reviewPullRequest` returns `costUsd` on its outcome
(`reviewer-core/src/review/run.ts` — `ReviewOutcome.costUsd`, summed across
map-reduce chunks). For OpenRouter it is the **real** generation cost
(`usage.cost`, requested via `usage: { include: true }` in
`reviewer-core/src/llm/openrouter.ts`); otherwise it falls back to
`PriceBook.estimate` (live OpenRouter `/models` prices, injected in
`server/src/platform/container.ts`) and finally to the static table in
`server/src/adapters/llm/pricing.ts`. Unknown models yield `null`.

What is missing is only persistence + transport:

- `agent_runs` (`server/src/db/schema/runs.ts`) has `tokens_in`, `tokens_out`,
  `score`, `blockers` — but **no `cost_usd`**.
- `ReviewRunExecutor.runOneAgent` destructures `{ tokensIn, tokensOut, grounding }`
  from the outcome and drops `costUsd` on the floor
  (`server/src/modules/reviews/run-executor.ts`).
- `RunSummary` and `RunStats` (`contracts/trace.ts`) and `PrMeta`
  (`contracts/platform.ts`) carry no cost field.
- The client has **no** cost formatter anywhere (the Agent Performance / CI Runs
  screens that use `total_cost_usd` in the contracts are not in this starter).

Note: `ci_runs.cost_usd` and the eval tables already store cost as
`doublePrecision` — this spec follows that precedent.

## 3. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Persist** `agent_runs.cost_usd` at run completion; do **not** recompute on read | Model prices change; a recompute would silently rewrite history. Also preserves OpenRouter's real `usage.cost`, which no price table can reproduce. Makes the PR-list read a cheap column select. |
| D2 | PR-list cost = **the sum of every completed run** on the PR | The column answers "what has reviewing this PR cost so far", which is the number a budget conversation needs. *(Revised 2026-09-20; originally latest-run semantics, to mirror `SCORE`. `SCORE` still shows the latest review, so the two columns deliberately describe different spans.)* |
| D3 | **No backfill.** `NULL` = unknown → render `—` | Honest. Applies equally to runs on models absent from the price book, and to failed/cancelled runs. |
| D4 | Timeline row shows **tokens and cost** together, as designed | The two numbers explain each other; cost alone invites "why is this one expensive?". |
| D5 | Cost reaches the Review Runs accordion as a **prop from the page**, not via a new `ReviewRecord` field | The PR detail page already holds both `usePrRuns()` (`RunSummary[]`, which will carry cost) and `usePrReviews()`; joining them in the page costs one `Map` and avoids a contract change plus a server-side join. |

### D2 — precise definition

Every `agent_runs` row for the PR with `status = 'done'`, summing the non-`NULL`
`cost_usd` values. Failed and cancelled runs are skipped rather than treated as
`$0`: they never produce a review either, so they cost nothing to skip.

Two nulls that mean different things, both rendered `—`:

- the PR has **no** completed run → `null`
- it has completed runs but **none** carries a price (model absent from the
  price book) → `null`, i.e. "unknown", never `$0.000`

A run with a known price alongside unpriced ones contributes its share; the
total is then a lower bound, which is the honest reading of partial data.

## 4. Data model

`server/src/db/schema/runs.ts`, on `agentRuns`:

```ts
/** Run cost in USD: provider-reported when available, else price-book
    estimated. Null when the model has no known price. */
costUsd: doublePrecision('cost_usd'),
```

Add `doublePrecision` to the `drizzle-orm/pg-core` import (see
`server/src/db/schema/ci.ts` for the same pattern).

Migration: `pnpm --dir server db:generate` → `0010_*.sql`
(`ALTER TABLE "agent_runs" ADD COLUMN "cost_usd" double precision;`). Do **not**
hand-write it — the journal (`src/db/migrations/meta/_journal.json`) has needed
repair before. Apply manually with `pnpm --dir server db:migrate`; the server
never migrates on boot.

## 5. Contracts

`@devdigest/shared` is **duplicated**, not symlinked. Every edit below must be
applied to **both** `server/src/vendor/shared/` and `client/src/vendor/shared/`.
The two `contracts/trace.ts` copies already differ (comment text only) — apply
the edit to each file, never `cp` one over the other.

`contracts/trace.ts`:

```ts
export const RunSummary = z.object({
  …
  cost_usd: z.number().nullable(),   // after tokens_out
});

export const RunStats = z.object({
  …
  /** Nullish, not nullable: run_traces documents written before this field
      existed have no key, and getRunTrace casts without parsing. */
  cost_usd: z.number().nullish(),
});
```

`contracts/platform.ts`:

```ts
export const PrMeta = z.object({
  …
  // Summed cost of the PR's completed runs (list endpoint only; null until reviewed).
  cost_usd: z.number().nullish(),
});
```

> **Why `RunStats.cost_usd` is `nullish`, not `nullable`.** `buildRunTrace`
> Zod-parses at write time, but `getRunTrace` casts (`row.trace as RunTrace`)
> at read time. A strict `nullable()` would make every pre-existing persisted
> trace a type-level lie: `stats.cost_usd` would be `undefined` at runtime while
> typed `number | null`. `nullish()` states the truth and the UI renders `—`.

## 6. Server changes

1. **`repository/run.repo.ts` → `completeAgentRun`**: add
   `costUsd?: number | null` to the `values` type and `costUsd: values.costUsd ?? null`
   to the `.set({…})`, alongside `score` / `blockers`. The `ReviewRepository`
   facade in `modules/reviews/repository.ts` re-declares this signature inline —
   widen it there too, or the executor fails to typecheck.
2. **`repository/run.repo.ts` → `listRunsForPull`**: map `cost_usd: run.costUsd`.
3. **`run-executor.ts` → `runOneAgent`**: destructure `costUsd` from the outcome;
   pass it to `completeAgentRun` and set `stats.cost_usd` on the `RunTrace`.
4. **`run-executor.ts` → failure/cancel path and `traceFromBuffer`**: `cost_usd: null`
   (partial spend before a mid-run failure is not recoverable from the outcome —
   `NULL` is the honest value, per D3).
5. **`modules/pulls/routes.ts` → `GET /repos/:id/pulls`**: alongside the existing
   latest-review score lookup, add a completed-run cost lookup using the *same*
   shape — one `inArray` query filtered `eq(status, 'done')`, accumulating
   `cost_usd` per `prId` (an unpriced run keeps the PR at `null` without adding
   to the total) — then `cost_usd: costByPr.get(r.id) ?? null` in the response map.

No change to `reviewer-core/` — it already returns `costUsd`.

## 7. Client changes

### 7.1 Shared formatter — new `client/src/lib/format-cost.ts`

Cost is needed in four components across three directories, so it belongs in
`lib/` beside the other single-purpose modules (`model-label.ts`,
`github-urls.ts`), not in a component-local `helpers.ts`.

```ts
/** USD cost for display. Null/undefined = unknown → em dash. */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;   // $0.0013
  if (usd < 1) return `$${usd.toFixed(3)}`;      // $0.014
  return `$${usd.toFixed(2)}`;                   // $1.24
}

/** Token count with thousands separators, e.g. "9,119". */
export function formatTokenCount(n: number): string {
  return n.toLocaleString("en-US");
}
```

Leave `RunTraceDrawer/helpers.ts`'s `formatTokens` alone — `15k→1.2k` is a
different, in→out summary for the Stats tile and is still used there.

### 7.2 Pull Requests list

- `pulls/constants.ts`: `COLUMN_KEYS` → insert `"cost"` before `"updated"`;
  `GRID` → `"1fr 132px 92px 60px 118px 76px 78px"` (new 76px slot for cost).
  The header row renders straight off `COLUMN_KEYS`, so no page change.
- `_components/PRRow/PRRow.tsx`: new cell before the `updated` cell —
  `<div className="tnum" style={s.muted}>{formatCost(pr.cost_usd)}</div>`.
  Left-aligned like its neighbours; `tnum` keeps the column's digits aligned.
- `messages/en/prReview.json`: `list.columns.cost: "Cost"` and
  `timeline.tokensCost` (§7.3).

### 7.3 Timeline row (`RunHistory.tsx`)

In the existing right-hand meta column (currently just the time), add a second
line below it, rendered only for settled runs that have token counts:

```
8:52:51 PM
9,119 tok · $0.0013
```

i.e. `t("timeline.tokensCost", { tokens: …, cost: … })` with
`timeline.tokensCost: "{tokens} tok · {cost}"` in `messages/en/prReview.json` —
the `tok` suffix is UI copy and must not be a literal (see `client/CLAUDE.md`).
Keep it in `var(--text-muted)` at `fontSize: 11` like the timestamp. Skip the
line entirely when the run is `running` / `failed` / `cancelled`.

### 7.4 Review Runs accordion (`ReviewRunAccordion.tsx`)

Per D5, add an optional `costUsd?: number | null` prop; render it as a mono
muted span between the score `Badge` and the `formatWhen(review.created_at)`
span. Omit the span when null (the header is already dense).

**As built:** the join lives in `FindingsTab`, not the page — `FindingsTab`
already receives both `runs: ReviewRecord[]` and `prRuns: RunSummary[]`, so it
builds `costByRun` in a `useMemo` and `page.tsx` needs no change at all.

### 7.5 Run Trace drawer Stats (`TraceBody.tsx`)

Fourth `<Stat>` between tokens and findings:

```tsx
<Stat label={t("trace.stat.cost")} val={formatCost(stats.cost_usd)} />
```

`s.statsRow` is `display: flex; gap: 10` with `flex: 1` tiles, so four fit the
720px drawer without a layout change. Add `trace.stat.cost: "COST"` to
`messages/en/runs.json`.

## 8. Edge cases

| Case | Behaviour |
|---|---|
| Model absent from the price book and provider returns no cost | `cost_usd` stays `NULL` → `—` everywhere |
| Run failed / cancelled | `NULL` → `—`; timeline omits the tokens·cost line entirely |
| Free model (`z-ai/glm-4.7-flash`, price 0) | genuine `0` → `$0.00`, distinct from `—` |
| PR never reviewed | no completed run → `—` in the list |
| PR whose only runs failed | `—` in the list (D2 skips non-`done` runs) |
| PR reviewed twice at $0.001 | `$0.002` in the list (D2 sums completed runs) |
| Trace document written before this feature | `stats.cost_usd` absent → `—` in the drawer |
| Mock LLM adapter (`adapters/mocks.ts`) | returns `costUsd: 0.001` → deterministic `$0.001` in tests |

## 9. Non-goals

- Per-severity `FINDINGS` column on the PR list (also visible in the mockups —
  explicitly out of scope here; the list deliberately omits it today).
- Budgets, caps, cost alerts, or a spend dashboard.
- Per-repo or per-workspace cost totals, and any budget/alerting on them (D2 covers only the per-PR total).
- Backfilling historical runs (D3).
- Embedding / indexing cost — this spec covers review runs only.

## 10. Test plan

| Layer | Test | Assertion |
|---|---|---|
| server | `test/contracts.test.ts` | `RunSummary` / `RunStats` / `PrMeta` parse with and without `cost_usd` |
| server | `test/reviews.it.test.ts` (existing "agent_runs row populated" block, ~L206) | `run.costUsd` is `0.001` after a mock-LLM run; `trace.stats.cost_usd` likewise |
| server | `test/reviews.it.test.ts` | a failed run persists `cost_usd = null` |
| server | new/extended integration test | `GET /repos/:id/pulls` sums the **done** runs' cost (two runs at `$0.001` → `$0.002`); a later failed run neither adds to it nor blanks it |
| client | new `src/lib/format-cost.test.ts` | the four formatting bands + `null` → `—` + `0` → `$0.00` |
| client | `RunHistory.test.tsx` | settled run renders `9,119 tok · $0.0013`; failed run renders neither |
| client | `RunTraceDrawer.test.tsx` | Stats shows a `COST` tile; `—` when the trace has no `cost_usd` |
| e2e | `flows/02-repo-pulls-detail.flow.json` | **not added.** `agent-browser` is not installed on this machine (all 7 flows fail `spawn agent-browser ENOENT`, unrelated to this change), and the column header is CSS-uppercased — DOM text `Cost`, rendered text `COST` — so which one `wait --text` matches could not be verified. Add it once the CLI is installed: `npm i -g agent-browser && agent-browser install` |

## 11. Implementation order

Each step is independently verifiable; run `pnpm typecheck` in the touched
package after each.

1. Schema + migration — edit `schema/runs.ts`, `db:generate`, review the SQL and
   the journal entry, `db:migrate`.
2. Contracts in **both** vendor copies; `diff -r` the two `contracts/` dirs to
   confirm only the known comment drift remains.
3. Server write path (run.repo + run-executor) → `pnpm --dir server test`.
4. Server read paths (`listRunsForPull`, `GET /repos/:id/pulls`).
5. `client/src/lib/format-cost.ts` + its unit test.
6. Trace drawer Stats tile (smallest UI surface, proves the pipe end to end).
7. Timeline row, then the accordion header.
8. PR list column (`constants.ts` + `PRRow` + i18n).
9. i18n keys; grep for any `list.columns.*` / `trace.stat.*` key used but not
   defined.
10. Re-run `./scripts/e2e.sh` (blocked here — see the e2e row in §10).

## 12. Risks

- **Vendor drift.** The single largest trap: editing only `server/src/vendor/shared`
  leaves the client compiling against a contract without `cost_usd`. Step 2's
  `diff -r` check is the guard.
- **Migration journal.** `db:generate` has produced a broken journal in this repo
  before (commit `2006964`). Inspect `meta/_journal.json` before committing.
- **Grid/column count mismatch.** `GRID` and `COLUMN_KEYS` are two independent
  constants that must stay the same length — changing one without the other
  silently misaligns the header from the rows.
- **`$0.060` vs `$0.06`.** The mockup's trace tile reads `$0.06`; the rule in §7.1
  renders `$0.060`. Deliberate: one rule across all four surfaces beats
  per-screen precision, and fixed decimals keep the list column aligned.
