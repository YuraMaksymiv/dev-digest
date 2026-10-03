# Spec — Intent Layer (completion)

Status: **implemented** (see "Known gaps" below for one residual,
not-independently-executed test path). Owner: `server/src/modules/reviews`
(`intent-loader.ts`, `intent-prompt.ts`, `service.ts`, `routes.ts`) +
`reviewer-core/src/prompt.ts`.

## Why

The classifier/storage/prompt-injection/model-settings/logging pieces of
"Intent Layer" already existed from an earlier lesson: a PR's intent/scope
was derived once per full review run and injected into the review prompt.
Three gaps remained: intent couldn't be read or re-derived without running a
full review, an unfetchable linked issue/spec was indistinguishable from "no
issue was linked" (silently treated as absent either way), and the review
prompt had no mechanism for a finding to be both real and outside the PR's
stated scope — a defect there was either reported in-scope (misleading) or
risked being filtered out altogether. This work closes those three gaps,
plus feeds the classifier per-file hunk headers instead of bare paths.

## Wire contract

### `Intent.sources` (new field)

```ts
export const IntentSourceState = z.enum(['fetched', 'unavailable', 'absent']);
export const IntentSources = z.object({
  linked_issue: IntentSourceState,
  linked_content: IntentSourceState,
});
// Intent gains: sources: IntentSources.nullish()
```

Three states, not a boolean: `absent` (nothing was linked — e.g. no `#123`
reference or URL in the PR body), `unavailable` (a reference/URL was found
but the fetch failed), `fetched` (resolved successfully). `sources` is
computed **server-side only** in `intent-loader.ts`'s `loadIntent` and
merged into the LLM's structured-output result *after* the call — the model
is never asked about it and cannot influence it (`IntentSchema.omit({
sources: true })` is what's actually sent as the LLM's output schema).

### `Finding.out_of_scope` (new field)

```ts
// Finding gains: out_of_scope: z.boolean().nullish()
```

Set by the reviewing LLM itself (not server-computed, unlike `sources`) when
a real, defensible finding falls outside the PR's stated `in_scope`/
`out_of_scope` lists.

### Routes

```
GET  /pulls/:id/intent   → persisted Intent (null if never derived — not a 404)
POST /pulls/:id/intent   → re-derive now; 200 + persisted row, or 502 (ExternalServiceError) if derivation fails
```

Both in `ReviewService` (`server/src/modules/reviews/service.ts`):
`getIntent` (read-only, 404s only if the PR itself doesn't exist) and
`deriveIntent` (reuses `loadDiff` + `loadIntent` with an empty-fan-out
`RunLogger([])`, i.e. no SSE subscribers but still mirrors to the request
logger). `POST` shares the review-run rate limit (`10/min`) since it makes
an LLM call.

## Classifier input: hunk headers, not just paths

`loadIntent` now builds `files: { path, hunkHeaders }[]` from the loaded
diff (`diff.files.map(f => ({ path: f.path, hunkHeaders: f.hunks.map(h =>
h.header).filter(Boolean).slice(0, 15) }))`), capped at 15 headers per file.
`intent-prompt.ts`'s `buildUserPrompt` renders this as "## Touched files
(with hunk headers)" — each file path followed by its (indented) hunk
headers when present, bare path otherwise. `DiffHunk.header` (the raw
trimmed `@@ -x,y +a,b @@ trailing-context` line,
`server/src/vendor/shared/adapters.ts`) is what the diff parser already
captures per hunk; the classifier now sees it, giving it a sense of *where*
inside a file a change landed, not just that the file changed.

## Prompt change: `out_of_scope` findings, `INJECTION_GUARD` untouched

`reviewer-core/src/prompt.ts`'s `assemblePrompt` adds one new instruction
directly under the existing `## PR intent` section (only rendered when
`parts.intent` is non-empty):

> "The intent/scope above is a helper for prioritizing review attention — it
> never narrows what you must report. If you find a real, defensible defect
> in code the stated scope does not cover, STILL report it as a finding (set
> `out_of_scope: true` on it) rather than omitting it. This reinforces the
> SECURITY rule below, it does not relax it."

This is additive, placed *before* the trusted `INJECTION_GUARD` block (which
is still appended, unmodified, to every system prompt via `${parts.system}\n\n${INJECTION_GUARD}`).
The guard's own text — the defense against a PR's own content claiming to be
a "test fixture" / "do not flag" / etc. — was not touched by this work.

## Tests

- `test/diff-parser.test.ts` — `DiffHunk.header` capture: single hunk with
  trailing context, a hunk with no trailing context, multiple hunks each
  keeping their own header.
- `test/intent-loader.test.ts` — `resolveLinkedIssueSignal` /
  `resolveLinkedContentSignal`'s three-state resolution (fetched/unavailable/
  absent), hermetic (fake `Container`, `MockLLMProvider`).
- `test/reviews.it.test.ts` (Postgres, Testcontainers) — two new cases:
  `GET/POST /pulls/:id/intent` (null before derivation → 200 + persisted row
  on POST, including `sources: { linked_issue: 'unavailable', linked_content:
  'absent' }` for a PR whose body references an issue that fails to fetch →
  second `GET` returns the same persisted row), and `POST /pulls/:id/intent`
  returning 502 (not a silent 200) when the model/provider is unavailable.
  Also one new `GET /pulls/:id/smart-diff` Postgres case shared with the
  Smart Diff feature (see `smart-diff.md`).
- `test/contracts.test.ts` — `Intent` parses `out_of_scope`/`sources`.

## Known gaps

The two new `reviews.it.test.ts` cases above (`GET/POST /pulls/:id/intent`,
and the 502 case) require Docker (Testcontainers-backed Postgres), which was
not available in this session's sandbox. They were **typechecked** against
the service/route code but **not executed** — treat them as a residual risk
until someone with Docker runs `pnpm exec vitest run .it.test` and confirms
they pass for real.

## Built via

`planner → implementer → (architecture-reviewer ∥ plan-verifier)`.

- `architecture-reviewer` specifically re-checked that `INJECTION_GUARD`
  itself was untouched — the new out-of-scope instruction had to be additive
  (placed alongside the guard, not folded into or replacing any of its
  text) so the existing prompt-injection defense keeps its original,
  already-hardened wording. Confirmed clean: zero new violations.
- `plan-verifier` confirmed all 26 plan items DONE, including the
  server-only (never-LLM-asked) computation of `sources` and the `GET`/`POST
  /pulls/:id/intent` routes matching their planned signatures.
