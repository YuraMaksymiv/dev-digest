# Spec — what the browser suite covers

One flow per user journey. The suite is a smoke net over the surfaces a
refactor can silently break, not a second unit-test layer.

| Flow | Journey | Key assertions |
|---|---|---|
| `01-app-boot` | app boots, root redirects into a repo's PR list | `/pulls` in the URL, `Pull Requests` heading, the `Findings` column header |
| `02-repo-pulls-detail` | list → open PR #482 → detail route | nested route `/pulls/482`, PR title on both pages |
| `03-agents` | agents list | seeded reviewer agents render |
| `04-pr-findings` | PR → Agent runs → seeded run → findings | verdict `request changes`, `2 findings`, the seeded `FindingCard`, the severity pills, and filtering the panel to CRITICAL |
| `05-pr-diff` | PR → Files changed | seeded file renders in the diff viewer |
| `06-onboarding` | `/onboarding` | add-repository form renders (no submit) |
| `07-settings` | `/settings/api-keys`, `/settings/models` | section titles render |
| `08-skills` | skills lab → agent Skills tab | seeded skill renders in the rail; the agent's `3 of 6 enabled` chip and a linked skill row |

## Deliberately not covered

- **Starting a review.** It would need a model call and a key; the suite asserts
  on seeded review output instead.
- **Mutations** (accept/reject a finding, delete a run, post a comment) — they
  would make the flows order-dependent against a shared seeded database.
- **Hover-only affordances**, such as the PR list's findings preview popover:
  the deterministic locator set (`--url`, `--text`, `find role|text|label`) has
  no hover primitive. That popover is covered by the client's
  `FindingsCell.test.tsx` instead.
- **Visual/layout regressions** — no screenshot diffing. `run.ts` only captures
  screenshots into `test-results/` when a step fails, as a debugging aid.

## Adding coverage

A new route or journey → a new `NN-<slug>.flow.json` plus a row in the table
above and in `e2e/README.md`. A new control inside a covered journey → extend
that journey's flow. See [docs/flow-authoring.md](../docs/flow-authoring.md).
