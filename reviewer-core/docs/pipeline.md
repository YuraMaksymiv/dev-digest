# The review pipeline

`reviewer-core` is the pure engine: **diff → prompt → LLM → grounded findings**.
No DB, no GitHub, no filesystem; the only side effect is a call through an
injected `LLMProvider`. Everything below is in `src/`.

## 1. Mode selection — `review/run.ts`

`reviewPullRequest()` first picks a mode via `selectMode(strategy, diff, threshold)`:

- `single-pass` — one LLM call over the whole diff.
- `map-reduce` — one call per file, then a reduce.
- `auto` (default) — map-reduce only when the diff is **both** larger than
  `mapThresholdLines` **and** multi-file; otherwise one call.

Each chunk's diff text comes from `sliceDiff()` (`review/reduce.ts`).

## 2. Prompt assembly — `prompt.ts`

`assemblePrompt()` composes the system prompt with the agent's skills, memory,
specs, caller context, repo map, PR description and the diff. Everything that
originates outside the agent (diff text, PR body) goes through
`wrapUntrusted(label, content)` — a delimiter that marks the block as data, so
instructions inside a PR cannot steer the review. The assembled prompt is
returned alongside the result so the run trace can show exactly what was sent.

## 3. Structured output — `llm/structured.ts`, `llm/openrouter.ts`

The model is asked for a `Review` (Zod → JSON Schema). Parsing is
parse-with-repair: a malformed payload is retried up to `maxRetries` before the
run fails. The provider client is the `openai` SDK pointed at an
OpenRouter-compatible endpoint, injected — tests stub it, so the suite is
hermetic and needs no key.

## 4. Grounding gate — `grounding.ts`

The mandatory mechanical filter, applied to every finding:

- A **diff-finding** survives only if its `[start_line, end_line]` intersects a
  real hunk for that file (`buildLineIndex()` maps file → new-side line numbers).
- **Full-file kinds** (`secret_leak`, `lethal_trifecta`, `phantom`, `hook`) come
  from scanners that aren't tied to a hunk — they only require the file to be
  present in the diff.
- Dropped findings are returned with a reason and shown in the trace, never
  silently discarded. `groundingSummary()` renders the "3/4 passed" line.

This is what stops a plausible-sounding finding about a line the PR never
touched from reaching the user.

## 5. Reduce and score — `review/reduce.ts`

`reduceReviews()` merges the per-chunk reviews; `scoreFromFindings()` turns the
kept findings into the PR score via `SEVERITY_PENALTY`
(`CRITICAL 35 · WARNING 12 · SUGGESTION 3`), so the number is derived, never
asked of the model.

## 6. CI shaping — `output/to-review.ts`

`countBlockers(findings, failOn)` applies an agent's `ci_fail_on` threshold
(`never | critical | warning | any`) via `SEV_RANK`, and `severityCounts()`
renders the `"2 critical · 1 warning · 3 suggestion"` line in the GitHub review
body. This is the canonical definition of a "blocker" — the UI mirrors it.

## Consumed as source

The server imports this package through a tsconfig path alias, as TypeScript
source — there is no build step (`build` = `tsc --noEmit`).
