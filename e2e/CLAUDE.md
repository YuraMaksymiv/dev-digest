# e2e/ — @devdigest/e2e

Deterministic browser flows for the web app via Vercel **agent-browser** (a
CDP CLI, not a test framework) — no Playwright, no LLM, no API key. How a
flow works: [README.md](README.md).

## Stack

agent-browser (external binary, install separately) · tsx · TypeScript 5.7.

## Commands

- `npm test` — runs against whatever stack is already up (needs a
  freshly-seeded DB — see gotcha below)
- `npm run e2e:hermetic` (or `../scripts/e2e.sh`) — spins up an isolated
  stack on alt ports, seeds it, tears down after — **the recommended way to
  run this locally**
- `npm run typecheck`

## Map

- `flows/*.flow.json` — one file per user flow, run in lexical filename
  order by `run.ts`.
- `lib/assert.ts` — `{BASE}` arg templating + substring assertions.
- `run.ts` — the runner: shares one browser session across flows,
  screenshots on failure into `test-results/` (git-ignored).
- `specs/` — feature specs (this file's kind of doc), **not** to be
  confused with `flows/`, which holds the runnable test flows.

## Non-default conventions

- Locators are deterministic only (`--url`, `--text`,
  `find role|text|label`) — the AI `chat` command is never used, so runs
  stay stable and key-free.
- Flows assume **only** the seeded demo repo (`acme/payments-api`, PR #482)
  exists — a dev DB with other imported repos breaks flows 02/04/05.

## Gotchas

- Never `docker compose down -v` to "reset" — it deletes the
  `devdigest_pgdata` volume (every real imported repo/review), not just
  this suite's state.
- Prefer the hermetic runner over pointing this at your normal dev stack.

## More

[docs/](docs/) · [specs/](specs/) · [INSIGHTS.md](INSIGHTS.md)
