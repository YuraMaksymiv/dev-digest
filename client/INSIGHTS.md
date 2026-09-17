# Insights — client/

Non-obvious things learned while building `client/`. Captured by the
[`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md)
skill. Append-only — correct a stale entry with a new dated note, never
rewrite it. Anti-banality test: if the code alone already tells the story,
skip it.

## What Works

## What Doesn't Work

## Codebase Patterns & Tool/Library Notes

- 2026-09-17 — The repo has NO prettier dependency and NO prettier config: `npx prettier --write` pulls a fresh prettier with the default 80-col `printWidth` and reflows every untouched line in the file (house style is ~100 cols), turning a 5-line change into a 46-line diff. Format new code by hand to match the surrounding file.
- 2026-09-17 — A `<button>` wrapping a `SeverityBadge` takes the badge's own text as its accessible name ("Critical 2"), not its `title` — content wins over `title` in the accname algorithm. Controls that e2e locates by `find role button --name` need an explicit `aria-label` saying what the click does (`_components/FindingsPanel/FindingsPanel.tsx`).

## Decisions

## Recurring Errors & Fixes

## Session Notes

## Open Questions
