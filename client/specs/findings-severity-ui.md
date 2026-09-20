# Spec — findings by severity in the UI

Status: **implemented**. Surfaces: PR list (`/repos/:repoId/pulls`) and PR detail
(`/repos/:repoId/pulls/:number?tab=findings`).

## 1. Counters + filter inside a review run

Where: the toolbar of `FindingsPanel`, i.e. inside an expanded run card under
`Review runs` — below the verdict banner and PR score, above the finding cards.

- One pill per severity **the run actually produced** (`CRITICAL 2 · WARNING 1`);
  a severity with no findings gets no pill.
- The count equals the number of finding cards of that severity rendered below —
  accepted and dismissed ones included, because the panel still renders them.
- Click a pill → only that severity's cards remain. Click it again → the full
  list returns. Single-select; the active pill is outlined, the others dim.
- Composes with the existing *Hide low confidence* toggle. The counts always
  come from the full list, so they never move while a filter is on.
- Keyboard focus (`j`/`k`) resets to the first card when the filter changes.
- Pure client-side: `severityCounts()` / `visibleFindings()` in the panel's
  `helpers.ts` group findings the page already fetched. **No LLM call, no new
  request** on open or on filter.

Pills are buttons with `aria-pressed` and an `aria-label` that states the action
("Show only CRITICAL findings" / "Show all severities").

## 2. FINDINGS column on the PR list

- A `SeverityBadge` per non-zero severity, worst first; `—` when the PR has
  never been reviewed or the latest review found nothing.
- Counts come from `PrMeta.findings` — the latest review, the same run behind
  the row's SCORE.

## 3. Hover preview on that column

Hovering (or focusing) the badges opens a popover headed
**"N FINDINGS IN THIS RUN"**, where N is the run's total. Each entry shows the
severity badge, title, category, `file:line`, confidence, and a two-line clamp of
the rationale. Read-only by design: **no buttons** — accepting or rejecting a
finding happens on the PR page, in the run card, where the full context is.

The server caps the preview at 4 (`PREVIEW_LIMIT`); the rest read as "+N more".
The popover is `position: fixed` and flips above the row near the viewport
bottom, because the list's table card clips its children (`overflow: hidden`).

## Non-goals

- No severity filter on the list itself (the status chips already filter rows).
- No aggregation across runs on the PR page: each run card counts its own
  findings, which is what "in this run" means.
