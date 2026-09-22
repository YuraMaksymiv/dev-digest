# Spec — findings severity on the PR list

Status: **implemented**. Owner: `server/src/modules/pulls`.

## Why

The PR list already answered "how good is this PR" (`score`) and "what did it
cost" (`cost_usd`). It could not answer "what kind of trouble is in it" without
opening the PR. The list needs a per-severity breakdown, and enough detail to
preview the findings on hover.

## Wire contract

`PrMeta` (list endpoint only) gains two nullish fields:

```ts
findings: { CRITICAL: number; WARNING: number; SUGGESTION: number } | null
findings_preview: PrFindingPreview[] | null
```

`PrFindingPreview` is a trimmed `Finding`: `severity`, `category`, `title`,
`file`, `start_line`, `confidence`, `rationale`. Deliberately **no id, no
suggestion, no trifecta payload** — the list is read-only; mutating a finding
happens on the PR page, and an id in the payload would invite an action button.

`null` means "never reviewed" and renders as `—`. An all-zero breakdown means
"reviewed, found nothing" — a different fact, same dash.

## Derivation

Both fields come from the **latest review** of the PR — the same review that
produced `score`, so a row never mixes runs.

1. `GET /repos/:id/pulls` already resolves the latest `reviews` row per PR
   (newest-first, `kind='review'`); it now keeps that review's id.
2. One `IN`-query over those review ids fetches the findings' severity plus the
   preview columns.
3. `rollupSeverities()` tallies them (`status.ts`); `toSeverityBreakdown()` maps
   the tally onto the wire's severity-enum keys.
4. `toFindingPreviews()` sorts worst-severity-first, then most confident, and
   caps at `PREVIEW_LIMIT` (4). The UI shows the remainder as "+N more" using
   the totals from `findings`.

No migration, no denormalised column, no extra endpoint, and no LLM call: this
is a `COUNT`/sort over rows the review already persisted.

## Cost, for contrast

`cost_usd` on the same row is the **sum of every completed run** on the PR, not
the latest one: it answers "what has reviewing this PR cost so far". Failed and
cancelled runs are excluded (they have no cost), and a PR whose completed runs
all lack a known model price stays `null` — unknown, not `$0`.

## Tests

- `test/pulls-status.test.ts` — `rollupSeverities`, `toSeverityBreakdown`,
  `toFindingPreviews` (ordering, cap, empty).
- `test/contracts.test.ts` — `PrMeta` accepts/rejects the new shapes.
- `test/reviews.it.test.ts` — end-to-end over Postgres: unreviewed PR → both
  fields null; after a run → breakdown + preview; cost sums across two runs.
