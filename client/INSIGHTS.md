# Insights — client/

Non-obvious things learned while building `client/`. Captured by the
[`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md)
skill. Append-only — correct a stale entry with a new dated note, never
rewrite it. Anti-banality test: if the code alone already tells the story,
skip it.

## What Works

## What Doesn't Work

- 2026-09-21 — Running `pnpm --dir client build` while `next dev` is up CORRUPTS the running dev server: the production build overwrites `.next/static`, so `main-app.js`, `app-pages-internals.js` and `layout.css` 404 and the page never hydrates. The symptom is silent and misleading — the route's server-rendered shell renders fine, but no React Query hook ever fires and lists come back empty with no error state. Fix: stop `next dev`, `rm -rf client/.next`, restart. Use `pnpm typecheck` (not `build`) to check types while a dev server is running.

## Codebase Patterns & Tool/Library Notes

- 2026-09-17 — The repo has NO prettier dependency and NO prettier config: `npx prettier --write` pulls a fresh prettier with the default 80-col `printWidth` and reflows every untouched line in the file (house style is ~100 cols), turning a 5-line change into a 46-line diff. Format new code by hand to match the surrounding file.
- 2026-09-17 — A `<button>` wrapping a `SeverityBadge` takes the badge's own text as its accessible name ("Critical 2"), not its `title` — content wins over `title` in the accname algorithm. Controls that e2e locates by `find role button --name` need an explicit `aria-label` saying what the click does. Evidence (added 2026-09-20): `src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:77`.
- 2026-09-20 — (evidence for the 2026-09-17 prettier note above) `client/package.json` declares no prettier dependency and the repo has no prettier config file, so `npx prettier` resolves nothing project-local and falls back to its own 80-col default.
- 2026-09-20 — The PR table card clips its children (`src/app/repos/[repoId]/pulls/styles.ts:90`, `tableCard.overflow: "hidden"`), so a popover anchored to a row must be `position: fixed` off the anchor's `getBoundingClientRect()` — an absolutely-positioned one is cut at the card edge. Implemented in `src/app/repos/[repoId]/pulls/_components/FindingsCell/styles.ts:73` (`popoverAt`), which also flips the box above the row near the viewport bottom.
- 2026-09-20 — `Severity` exported from `@devdigest/ui` has FOUR members (`src/vendor/ui/primitives/tokens.ts:3` adds `INFO`), while the wire enum has three. Typing a loop over a `{CRITICAL,WARNING,SUGGESTION}` object with the UI `Severity` fails typecheck with "Property 'INFO' does not exist" — key such loops off the payload type (`keyof NonNullable<PrMeta["findings"]>`), not off the UI union.

## Decisions

## Recurring Errors & Fixes

## Session Notes

## Open Questions
