# Implementation Plan — PR Brief: line-level deep link

Spec: [pr-brief.md](pr-brief.md) (approved, re-approved 2026-10-06) · Execution mode: **single-agent** (T1, T6, T2, T3, T4, T5, then review gates)

## Goal & Scope
Client-only amendment: a line-level deep link from a Review focus item to Files changed. In scope: AC-26 (amended), AC-31..AC-37. AC-1..30 and NFR-1..5 are implemented (commit 3723446, see [pr-brief.plan.md](pr-brief.plan.md), [pr-brief.verification.md](pr-brief.verification.md)) and are not re-planned.

## Assumptions
- [T1] `diffHref(repoId, number, file, line?: number | null)` keeps its first three arguments; a null/undefined `line` yields the old URL with no `&line=`.
- [T2] `page.tsx` parses `?line=` with a strict `/^[1-9]\d*$/` test, anything else → `null` (AC-34). `line` is passed to `DiffTab` only when `?file=` is present. The "file matches no PR file" half of AC-34 is handled in T4.
- [T4] The target is keyed `${file}:${line ?? ""}`; a `useRef` holds the last scrolled key → "scroll once per target" (AC-35, E17).
- [T3] `aria-current="true"` on the row. No row `id`: the row is found via a ref callback.
- AC-36 appears implemented (`PrBrief.tsx:187` renders `file:line`, `brief.json:67` has `focusOpenAriaLine`). T6 adds the test; no code change if it passes.

## Recommendations
- Remove the open-then-scroll race by design, not with a timeout or `requestAnimationFrame`: open the card (and, via `DiffViewer`, the group) from the target in state, and scroll in an effect that depends on the row being mounted. Today the effect depends on `[focused]` only and scrolls in the same tick as `setOpen(true)`, before the body mounts (`FileCard.tsx:94-98`); the closed-group path has the same problem (`DiffViewer.tsx:106`). (AC-31, AC-35)
- No new context or store: pass one `focusTarget: {file, line} | null` prop down `DiffTab` → `DiffViewer` → `FileCard` → `CodeLine`, replacing `focusFile` (`DiffTab.tsx:122`, `DiffViewer.tsx:81`). (AC-31..35)
- e2e flow deferred (optional per spec); jsdom with stubbed `scrollIntoView` covers the logic.
- Extra test angles: only `line` changes while `focusFile` stays (AC-35); the target row also carries a finding or comment (E14, AC-32).

## Modules affected
| Module | Why | AC-IDs |
|---|---|---|
| `client/` | `page.tsx`, `DiffTab`, `diff-viewer/*`, `PrBrief/helpers.ts`, `PrBrief.tsx`, tests | AC-26, AC-31..37 |
| `server/`, `reviewer-core/`, `e2e/`, `mcp/`, `@devdigest/shared` | none — `review_focus[].line` already exists (spec D11, §7) | — |

## Constraints & conventions
- UI only from `@devdigest/ui`; do not touch `client/src/vendor/ui/` or lock files (`client/CLAUDE.md`, root `CLAUDE.md` "Do not touch").
- Highlight uses CSS variables (`var(--accent)`), no hard-coded colours.
- No new UI copy needed; any copy goes through next-intl.
- Colocated `<Name>.test.tsx`; styles stay in `diff-viewer/styles.ts` (`s`, `lineRowFor`, `styles.ts:109`).
- `frontend-ui-architecture` import direction: `diff-viewer` is shared and must not import from `app/`; the target comes in by props.
- No prettier: format by hand, ~100 columns (`client/INSIGHTS.md:22`).

## Relevant INSIGHTS.md notes
- client `:22` no prettier · `:13` use `pnpm typecheck`, not `build`, while `next dev` runs.
- No entry covers diff-viewer scroll/highlight. At session end consider a note: open-then-scroll must key off row mount, not `[focused]`.

## Plan tasks
| # | Task | Module | AC-IDs | Skill(s) | Depends on |
|---|---|---|---|---|---|
| T1 | `PrBrief/helpers.ts`: `diffHref(repoId, number, file, line?)` appends `&line=<n>` when `line != null`. `PrBrief.tsx:96` `open(file, line)`; the `onClick` at `:184` passes `f.line`. Update the helpers test and the pinned URLs at `PrBrief.test.tsx:124-126` (line-less case, case with a line, path that needs encoding). | client | AC-26 | `react-best-practices`, `react-testing-library`, `typescript-expert` | — |
| T2 | `page.tsx:62`: parse `?line=` as a strict positive integer or `null`; build `focusTarget`; pass it to `<DiffTab>` (`page.tsx:174`). `DiffTab`: replace `focusFile` with `focusTarget`, pass to `DiffViewer`. | client | AC-31, AC-34 | `next-best-practices`, `react-best-practices` | — |
| T3 | `CodeLine` + `styles.ts`: `target?: boolean` prop and a `rowRef` callback. When `target`, apply a highlight via `lineRowFor(kind, sevColor, target)` distinct from severity colour (outline/background from `var(--accent)`) and set `aria-current="true"`. Persistent until the URL changes (no timer); stays visible with a finding/comment on the row (E14). | client | AC-32 | `frontend-ui-architecture`, `react-best-practices` | — |
| T4 | `DiffViewer`: accept `focusTarget`; open the target file's group (existing effect `:53-59`); support grouped and flat "original" order (E15). `FileCard`: take `focusTarget` for its own file only; open the card (any size); find the row with `kind` `add`/`ctx` and `newNo === line`, mark it `target`; scroll with `block: "center"`, `behavior: "auto"` under `prefers-reduced-motion: reduce`, else `"smooth"` (AC-37). No such row / null `line` / null or empty patch → scroll the card `block: "start"` with the existing `fileCardFocused` style, no message (AC-33). Scroll in an effect that runs after the open state rendered (row ref attached), keyed on the target and run once per key via a ref guard (AC-35, E17). Optional-chain `matchMedia` and `scrollIntoView` for jsdom. | client | AC-31, AC-32, AC-33, AC-35, AC-37 | `frontend-ui-architecture`, `react-best-practices`, `typescript-expert` | T2, T3 |
| T5 | Component tests with stubbed `scrollIntoView` and `matchMedia` (extend `DiffViewer.test.tsx`; `CodeLine`/`FileCard` tests only if needed): (a) line in a closed docs group or a file over 200 lines → opened, row scrolled `block: "center"`, has `aria-current`; (b) line in a gap, null patch, or `del`-only line → card fallback, no error; (c) changed `line` re-scrolls, an unchanged re-render does not; (d) flat "original" order; (e) reduced motion → `behavior: "auto"`; (f) invalid `line` (0, -1, 1.5, "x", no `file`) and unknown file ignored. Cover `page.tsx` parsing via a render test, or extract a pure `parseLineParam` helper with its own test. | client | AC-31..35, AC-37 | `react-testing-library` | T2, T3, T4 |
| T6 | `PrBrief.test.tsx`: a focus item with non-null `line` shows `<file>:<line>`; a null `line` shows only the file. | client | AC-36 | `react-testing-library` | — |

## AC coverage
| AC-ID | Tasks | Verified by |
|---|---|---|
| AC-26 | T1 | `PrBrief.test.tsx` · `pnpm --dir client test` |
| AC-31 | T2, T4, T5 | `DiffViewer.test.tsx` · `pnpm --dir client test` |
| AC-32 | T3, T4, T5 | same |
| AC-33 | T4, T5 | same |
| AC-34 | T2, T4, T5 | same + page-level parse test |
| AC-35 | T4, T5 | same |
| AC-36 | T6 | `PrBrief.test.tsx` · `pnpm --dir client test` |
| AC-37 | T4, T5 | same |

## Test plan
- `pnpm --dir client test` — AC-26, AC-31..37 (scoped `vitest related …` while working; full suite once at the end via `test-runner`).
- `pnpm --dir client typecheck` — all tasks (prop rename `focusFile` → `focusTarget`).
- No `server`, `reviewer-core` or `e2e` commands needed.

## Out of scope
Spec/AC changes; a fallback message (rejected by the user); server or contract change; AC-1..30, NFR-1..5; e2e flow; architecture and security review (separate agents).

## Risks
- Scroll timing: the row mounts only after group and card open, so the scroll must depend on the row ref, not `[focused]` (spec §2). T5 (a) and (c) guard it.
- Smooth scroll can be shifted by findings/comments rendering above the row; not observable in jsdom — check once manually in `./scripts/dev.sh`.
- `DiffViewer.tsx:53-59` sets `collapsed` only in grouped order; if `smartDiff` arrives after first render the effect re-runs, so the scroll guard must not mark the target done before the row exists.
- No "Do not touch" area is touched.
