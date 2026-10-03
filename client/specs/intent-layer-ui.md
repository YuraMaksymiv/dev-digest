# Spec — Intent Layer in the UI (IntentCard)

Status: **implemented**. Surface: PR detail, Overview tab
(`/repos/:repoId/pulls/:number` — the default tab).

## Why

The server could already derive and persist a PR's intent/scope (earlier
lesson), and `reviewer-core` could inject it into the review prompt — but
there was no client surface showing it at all. `IntentCard` is that missing
piece: a plain-language summary of what the PR is trying to do, its inferred
category and confidence, its in-scope/out-of-scope lists, and a way to
re-derive it without running a full review.

## Component

`IntentCard` — `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/IntentCard/IntentCard.tsx`,
rendered from `OverviewTab.tsx`. Data: `usePrIntent(prId)` (`GET
/pulls/:id/intent`) and `useRederiveIntent(prId)` (`POST
/pulls/:id/intent`, both `client/src/lib/hooks/reviews.ts`). On a
successful re-derive, the mutation writes the fresh `Intent` straight into
the `["pr-intent", prId]` query cache (`qc.setQueryData`) — no refetch
round-trip.

States:

- **Loading** — skeleton placeholders.
- **Never derived** (`intent` is `null`) — `EmptyState` with a "Re-check
  intent" CTA (`intentCard.emptyTitle`/`emptyBody`/`recheck`,
  `brief.json`).
- **Derived** — header row (`Target` icon, category `Badge` with a
  per-category icon from `INTENT_CATEGORY_ICON`, `ConfidenceNum` showing
  `intent.confidence`, a ghost "Re-check intent" button), the one/two
  sentence `intent.intent` summary, then a two-column in-scope/out-of-scope
  list (`intent.in_scope` / `intent.out_of_scope`; an empty list renders
  "Nothing specific noted." rather than nothing).

## Missing-context warning

When `intent.sources?.linked_issue === 'unavailable'` or
`intent.sources?.linked_content === 'unavailable'`, a warning row (triangle
icon) renders below the scope lists with the corresponding hint
(`intentCard.missingIssueHint` / `missingContentHint`) — surfacing the
server's three-state `sources` distinction (`fetched`/`unavailable`/
`absent`) so a reviewer knows the intent may be based on incomplete context,
rather than silently trusting a confidence score that doesn't account for a
failed fetch. `absent` (nothing was ever linked) renders no warning — that's
a normal state, not a problem.

## Re-check intent

The "Re-check intent" button (present in both the empty and derived states)
calls `useRederiveIntent(prId).mutate()`, which hits `POST
/pulls/:id/intent` — the lightweight re-derivation path that does **not**
run a full review (`server/specs/intent-layer.md`). Button shows a loading
state (`intentCard.rechecking`) while pending.

## `Finding.out_of_scope` rendering (shared `FindingCard`, not `IntentCard` itself)

Not part of `IntentCard`, but the client-side counterpart to
`server/specs/intent-layer.md`'s `Finding.out_of_scope` field: the shared
`FindingCard` (`client/src/components/finding-card/FindingCard.tsx`, used by
both the diff viewer — see `smart-diff-ui.md` — and the PR-page findings
panel) renders an "Out of scope" warning `Badge` (`finding.outOfScope`,
`prReview.json`) next to the title whenever `f.out_of_scope` is true. This is
how a finding the LLM marked as outside the PR's stated scope stays visibly
distinguishable instead of reading as an in-scope finding.

## Non-goals

- No history of past intent derivations — `GET /pulls/:id/intent` returns
  only the current persisted row; re-deriving overwrites it.

## Built via

`planner → implementer → (architecture-reviewer ∥ plan-verifier)`. See
`server/specs/intent-layer.md`'s "Built via" section — the reviewer-agent
findings that session (the `INJECTION_GUARD`-untouched confirmation, the
26/26 plan-verifier pass) were on the server/`reviewer-core` side; nothing
client-specific was flagged for `IntentCard` beyond the plan items it was
built against.
