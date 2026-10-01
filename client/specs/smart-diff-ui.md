# Spec — Smart Diff in the UI

Status: **implemented**. Surfaces: PR detail, Files-changed tab
(`/repos/:repoId/pulls/:number?tab=diff`).

## 1. Smart vs. original order

`DiffTab` (`client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx`)
fetches the PR's grouping via `useSmartDiff(prId)`
(`client/src/lib/hooks/reviews.ts`, `GET /pulls/:id/smart-diff`) and passes it
to `DiffViewer` as `smartDiff: SmartDiffViewerData`. A toolbar button toggles
`order: "smart" | "original"`:

- **Smart** (default) — `DiffViewer` renders `smartDiff.groups` via
  `orderFiles()` (`client/src/components/diff-viewer/helpers.ts`): one
  `GroupHeader` + file list per role, in the server's `SMART_DIFF_GROUP_ORDER`.
- **Original** — falls back to GitHub's raw `PrFile[]` order, no grouping.

`docs` and `boilerplate` groups start collapsed (`DEFAULT_COLLAPSED` in
`DiffViewer.tsx`); `core`, `tests`, `wiring` start open.

## 2. Group headers

`GroupHeader` (`client/src/components/diff-viewer/GroupHeader/GroupHeader.tsx`)
shows the role label, a chevron, the file count, and — only when non-zero —
`"N files have findings"`. The findings count is computed client-side in
`DiffViewer` (`g.files.filter((f) => findingsFor(f.path).length > 0).length`),
not sent by the server as a separate field.

## 3. Per-file findings dot

`FileCard` (`client/src/components/diff-viewer/FileCard/FileCard.tsx`) renders
a small dot (`s.findingsDot`, `aria-label`/`title` = `shell.diffViewer.hasFindingsDot`)
next to the file header whenever `hasFindings` is true — i.e. `DiffViewer`
found at least one `FindingRecord` whose `file` matches that `PrFile.path`.

## 4. Inline finding comments

Each `CodeLine` (`client/src/components/diff-viewer/CodeLine/CodeLine.tsx`)
that has findings anchored to it renders a `FindingCard`
(`client/src/components/finding-card/`) directly under that line, inside the
same thread column GitHub comment threads use. The line itself gets a
severity-colored left stripe (`lineRowFor(ln.kind, sevColor)`) and an inline
severity label (`severityLabelFor`), both driven by the **highest-severity**
finding anchored to that line (`CRITICAL` > `WARNING` > `SUGGESTION`,
`topSeverity()`): a line with both a CRITICAL and a WARNING finding gets the
CRITICAL stripe/label, but both `FindingCard`s still render underneath.

Anchoring (`FileCard.tsx`'s `anchorFindings`): exact match on the finding's
`start_line` first; failing that, the first rendered line whose `newNo` falls
within `[start_line, end_line]`. A finding that can't be anchored to any
rendered line (e.g. its range isn't in the visible patch) renders in an
"unmatched" block at the bottom of the file instead of silently vanishing.

`FindingCard` here is the same shared component the PR-page findings panel
uses (`client/src/components/finding-card/`) — accept/dismiss wired through
`onFindingAction` behaves identically in both places.

## 5. Visibility toggle

A single "Show/Hide comments" toolbar button (`DiffTab.tsx`) toggles both
GitHub review comments and finding comments together
(`showComments`/`showFindings` state, both default per their own rule:
GitHub comments start hidden, findings start **visible** — expanding a file
must show its findings without an extra click).

## Non-goals

- No split-PR UI: `split_suggestion.proposed_splits` is always `[]` from the
  server in this implementation; the client doesn't render a splitting
  affordance.
- No `pseudocode_summary` rendering: the field is `null` from the server in
  this implementation (reserved for a future lesson).

## Built via

`planner → implementer → (architecture-reviewer ∥ plan-verifier)`. See
`server/specs/smart-diff.md`'s "Built via" section for what each reviewer
agent caught — the `FindingCard` promotion to `client/src/components/finding-card/`
(an `architecture-reviewer` finding) is the one with client-side impact:
both `FileCard` and `CodeLine` import it from that shared location, not from
a route-local folder.
