# Insights — e2e/

Non-obvious things learned while building `e2e/`. Captured by the
[`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md)
skill. Append-only — correct a stale entry with a new dated note, never
rewrite it. Anti-banality test: if the code alone already tells the story,
skip it.

## What Works

## What Doesn't Work

## Codebase Patterns & Tool/Library Notes

- 2026-09-17 — Severity/status labels that LOOK uppercase in the UI are lowercase in the DOM with `textTransform: "uppercase"` (`vendor/ui/primitives/Badge.tsx`, `tokens.ts` `SEV.label`). `wait --text "SUGGESTION"` therefore never matches — assert on the DOM spelling ("Suggestion"). Likewise `find role button --name` matches the ACCESSIBLE name: a button whose content is a badge is named by that badge's text unless the component sets `aria-label`.

- 2026-09-16 — `./scripts/e2e.sh` boots its whole hermetic stack (pg + API :3101 + web :3100) and only THEN fails if the external `agent-browser` CLI is missing — every flow reports `spawn agent-browser ENOENT`, which reads like a suite-wide regression rather than a missing binary. `e2e/` also installs with **npm** (`package-lock.json`), not pnpm like the other packages. First-time setup on a machine: `cd e2e && npm ci` plus `npm i -g agent-browser && agent-browser install` (downloads Chrome for Testing).

## Decisions

## Recurring Errors & Fixes

## Session Notes

## Open Questions
