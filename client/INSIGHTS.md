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

- 2026-09-22 — React Query DROPS a mutation's per-call `onSuccess`/`onSettled` callbacks when the component that called `mutate` unmounts first. A modal that does `link.mutate(x, { onSettled: () => router.push(...) })` and then `onClose()` therefore navigates NEVER — the write lands, the redirect silently does not, and it looks like the action failed. Use `await mutateAsync(...)` and put the follow-up after the await. Evidence: `src/app/repos/[repoId]/conventions/_components/CreateSkillModal/CreateSkillModal.tsx` (`createAndLink`).
- 2026-09-22 — `IconBtn` (`src/vendor/ui/primitives/IconBtn.tsx:4`) takes `label` (used for BOTH `title` and `aria-label`) and has NO `disabled` prop, so an icon action cannot be gated on a pending state by props the way `Button`'s `disabled`/`loading` can — the guard has to live in the `onClick` handler. Related: the pencil icon is exported as `Edit` (aliased to lucide's `Pencil` at `icons.tsx:147`), so `icon="Pencil"` does not typecheck.
- 2026-09-22 — A control that spends money must not rely on `isPending` captured at RENDER time: two separate controls can both be visible (here a header button and an `EmptyState` CTA both starting a paid LLM scan), and a click landing before the pending re-render commits fires a second request. Guard with a `useRef` flag read at CLICK time, cleared in `onSettled`. Evidence: `src/app/repos/[repoId]/conventions/_components/ConventionsView/ConventionsView.tsx` (`runScan`).
- 2026-09-21 — A next-intl message containing an UNPAIRED angle bracket (e.g. a placeholder written as `When <the diff does X>, <report Y>.`) fails to parse: intl-messageformat reads `<…>` as a rich-text tag, and the UI silently renders the raw key (`skills.new.descriptionPlaceholder`) instead of throwing. Paired tags are the legitimate use (`<b>…</b>` in `settings.json`, `<pr>…</pr>` in `conformance.json`). Use square brackets for template placeholders.
- 2026-09-21 — `FormField` already carries `marginBottom: 20` (`src/vendor/ui/kit/FormField.tsx:17`), so wrapping a set of them in a flex column with a `gap` stacks the two and double-spaces the whole form. The house pattern is a plain block wrapper with no gap — `CreateAgentModal` and the agents `ConfigTab` both do this. Related: `Modal` gives its children NO padding; a modal body needs its own `padding: 24` wrapper and its footer its own `justifyContent: "flex-end"` — passing bare buttons to `footer` left-aligns them.
- 2026-09-17 — The repo has NO prettier dependency and NO prettier config: `npx prettier --write` pulls a fresh prettier with the default 80-col `printWidth` and reflows every untouched line in the file (house style is ~100 cols), turning a 5-line change into a 46-line diff. Format new code by hand to match the surrounding file.
- 2026-09-17 — A `<button>` wrapping a `SeverityBadge` takes the badge's own text as its accessible name ("Critical 2"), not its `title` — content wins over `title` in the accname algorithm. Controls that e2e locates by `find role button --name` need an explicit `aria-label` saying what the click does. Evidence (added 2026-09-20): `src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:77`.
- 2026-09-20 — (evidence for the 2026-09-17 prettier note above) `client/package.json` declares no prettier dependency and the repo has no prettier config file, so `npx prettier` resolves nothing project-local and falls back to its own 80-col default.
- 2026-09-20 — The PR table card clips its children (`src/app/repos/[repoId]/pulls/styles.ts:90`, `tableCard.overflow: "hidden"`), so a popover anchored to a row must be `position: fixed` off the anchor's `getBoundingClientRect()` — an absolutely-positioned one is cut at the card edge. Implemented in `src/app/repos/[repoId]/pulls/_components/FindingsCell/styles.ts:73` (`popoverAt`), which also flips the box above the row near the viewport bottom.
- 2026-09-20 — `Severity` exported from `@devdigest/ui` has FOUR members (`src/vendor/ui/primitives/tokens.ts:3` adds `INFO`), while the wire enum has three. Typing a loop over a `{CRITICAL,WARNING,SUGGESTION}` object with the UI `Severity` fails typecheck with "Property 'INFO' does not exist" — key such loops off the payload type (`keyof NonNullable<PrMeta["findings"]>`), not off the UI union.

## Decisions

## Recurring Errors & Fixes

## Session Notes

## Open Questions
