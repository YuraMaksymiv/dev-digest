# Spec — Smart Diff (role-grouped Files changed)

Status: **implemented**. Owner: `server/src/modules/reviews`.

## Why

GitHub's "Files changed" tab lists files in raw diff order — a config tweak,
a snapshot update, and the actual logic change all sit at the same visual
level. A reviewer has to re-derive "what's the real change here" every time.
Smart Diff buckets a PR's changed files into five fixed roles (`core`,
`tests`, `wiring`, `docs`, `boilerplate`) so the tab reads core-logic-first,
and anchors the PR's latest findings onto the exact grouped file/line so a
reviewer doesn't have to cross-reference a separate findings panel while
reading the diff.

## Wire contract

New `GET /pulls/:id/smart-diff` route, served by `ReviewService.getSmartDiff`
(`server/src/modules/reviews/service.ts`). Response is the `SmartDiff`
contract (`server/src/vendor/shared/contracts/brief.ts`, mirrored in
`client/src/vendor/shared`):

```ts
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);

SmartDiffFile = { path, pseudocode_summary: string | null, additions, deletions, finding_lines: number[] }
SmartDiffGroup = { role: SmartDiffRole, files: SmartDiffFile[] }
SmartDiff = {
  groups: SmartDiffGroup[],               // always all 5 roles, even empty, in display order
  split_suggestion: { too_big: boolean, total_lines: number, proposed_splits: ProposedSplit[] },
}
```

`pseudocode_summary` is always `null` in this implementation — the field
exists in the contract but is reserved for a future lesson; nothing
populates it yet. `proposed_splits` is likewise always `[]`: `too_big` /
`total_lines` are computed (see below) but no split proposal is generated.

## Derivation

`buildSmartDiff(files, findings)` (`server/src/modules/reviews/helpers.ts`,
pure, no I/O per the module's `helpers-have-no-io` rule):

1. `classifyFile(path)` (`helpers.ts`) walks `SMART_DIFF_CLASSIFY_RULES`
   (`server/src/modules/reviews/constants.ts`), first match wins; a path
   matching nothing falls back to `core`. Match order (not the display
   order) is boilerplate → tests → wiring → docs, specifically so that
   overlapping patterns resolve predictably — e.g. a `.snap` file under
   `__tests__/` still reads as `boilerplate` (the snapshot rule runs before
   the `tests`-directory rule), and any path under a `__snapshots__/`
   directory is boilerplate even without a `.snap` extension.
2. Each file's `pr_files` row is bucketed into its role's group, in
   `SMART_DIFF_GROUP_ORDER` (`core, tests, wiring, docs, boilerplate`).
3. The **latest** `kind: 'review'` row's findings (`ReviewService.getSmartDiff`
   picks `rows.find(({ review }) => review.kind === 'review')`) are matched
   to files by `file` path; each file's `finding_lines` is the sorted,
   deduped list of those findings' `start_line`s.
4. `split_suggestion.too_big` is `totalLines >= SMART_DIFF_BIG_PR_LINES` (500
   changed lines, additions + deletions across all files).

No LLM call — this is a pure path/line classification over data the server
already has (`pr_files`, the latest review's findings).

## Tests

- `test/smart-diff.test.ts` — `classifyFile` (one case per role + the 3
  disambiguation cases above), `buildSmartDiff` (all-5-groups-even-empty,
  bucketing + finding-line dedup/sort, contract round-trip via
  `SmartDiff.safeParse`).
- `test/reviews.it.test.ts` — `GET /pulls/:id/smart-diff` over Postgres: 200,
  valid `SmartDiff`, groups in display order, a `core` + a `docs` file land
  in the right group.
- `test/contracts.test.ts` — `SmartDiff` parses a full shape and covers all 5
  roles; an unknown role is rejected.

## Built via

`planner → implementer → (architecture-reviewer ∥ plan-verifier)`.

- `architecture-reviewer` caught a real import-direction violation: the
  review-shared `FindingCard` had initially landed in a route-local
  `_components/` folder while `DiffTab`'s diff-viewer components (a
  `client/src/components/` top-level feature) needed to import it — that
  direction isn't allowed by this repo's component layering. Fix: `FindingCard`
  was promoted to `client/src/components/finding-card/`, so both the PR-page
  findings panel and the diff viewer import it from the same shared location.
- `plan-verifier` flagged that the classifier's snapshot handling needed a
  directory-level rule, not just the `.snap` extension rule, to catch
  non-`.snap` files living under `__snapshots__/`; the
  `__snapshots__/` directory rule in `SMART_DIFF_CLASSIFY_RULES` was added
  alongside the extension rule as a result.

Both agents passed the finished implementation clean after these fixes.
