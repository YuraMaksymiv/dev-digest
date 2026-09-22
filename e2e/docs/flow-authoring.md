# Writing a flow

A flow is a JSON list of `agent-browser` commands, not a test-framework file.
`run.ts` loads every `flows/*.flow.json` in lexical order, runs the commands
through one shared browser session, and fails a step the moment a command exits
non-zero. That is the whole mechanism — there is no assertion library, no
retries, and no LLM.

## Shape

```json
{
  "name": "short sentence, present tense",
  "description": "what it proves, which seeded data it assumes, why the steps are in this order",
  "steps": [
    { "cmd": ["open", "{BASE}/"], "label": "load the app root" },
    { "cmd": ["wait", "--url", "/pulls"], "label": "land on the PR list" },
    { "cmd": ["wait", "--text", "Pull Requests"], "label": "heading renders" }
  ]
}
```

- `{BASE}` is templated from `E2E_BASE_URL` (`lib/assert.ts` → `resolveArgs`).
- `label` is what a failure report prints — write it as the thing being proven,
  not "step 4".
- `assert: { "stdoutIncludes": "…" }` adds a light substring check on a
  command's stdout; the `wait` itself is usually assertion enough.
- Keep the `description` honest about data assumptions — the next person debugging
  a red flow reads it first.

## Locators: deterministic only

Allowed: `--url`, `--text`, and `find role|text|label`. The AI `chat` command is
never used, so runs stay stable and key-free.

Two traps that produce a flow which fails for the wrong reason:

- **Casing.** Labels that look uppercase in the UI are usually
  `textTransform: uppercase`; the DOM text keeps its original casing. Assert
  `"Suggestion"`, not `"SUGGESTION"`.
- **Accessible names.** `find role button --name` matches the accessible name.
  A button whose content is a badge is named by that badge's text unless the
  component sets an `aria-label`. If you need a stable name, add the
  `aria-label` in the client — don't weaken the locator.

There are no `data-testid`s in this repo, by choice: flows assert what a user
can see.

## Data assumptions

Flows target the **seeded** demo repo `acme/payments-api` (PR #482) and nothing
else — a dev database with other imported repos breaks 02/04/05. Run the
hermetic stack (`../scripts/e2e.sh` or `npm run e2e:hermetic`), which brings up
its own Postgres + API + web on isolated ports and seeds them fresh.

Nothing in a flow may trigger a model call: the suite must stay free and
deterministic. Assert on seeded review output instead of starting a run.

## When a flow is warranted

One flow per user journey, not per component — component behaviour belongs in
the client's vitest tests. Add a flow when a new *route* or *journey* appears;
extend the nearest existing flow when a new control appears inside one.

## Local setup

`e2e/` installs with **npm** (`package-lock.json`), unlike the pnpm packages.
The `agent-browser` binary is external:

```bash
cd e2e && npm ci
npm i -g agent-browser && agent-browser install
```

Without it every flow fails with `spawn agent-browser ENOENT` — a missing
binary, not a regression.
