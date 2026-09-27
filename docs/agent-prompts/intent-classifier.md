# Intent classifier prompt

The prompt behind `review_intent` (`FeatureModelId`) — a best-effort, standalone
structured-output call made once per run, BEFORE the per-agent reviews, to derive
a PR's intent and scope. Unlike the reviewer agents in this folder, it is not
assembled via `reviewer-core`'s `assemblePrompt` (no diff, no `Review` schema):
it is its own system/user prompt, output-shaped by the shared `Intent` Zod
contract (`server/src/vendor/shared/contracts/brief.ts`).

> The code is the source of truth at run time
> (`server/src/modules/reviews/intent-prompt.ts`). This file is the
> human-readable original — keep both in sync when either changes.

## Where it runs

`server/src/modules/reviews/intent-loader.ts`, called once per run from
`run-executor.ts` right after the diff loads. It is enrichment, not a gate: any
internal failure is caught and the run proceeds without an intent (the `## PR
intent` prompt section is simply omitted for every agent in that run).

## Signals given to the model

In order of how much they are worth trusting:

1. **PR description** (`pull.body`) — the strongest signal when present.
2. **Linked ticket/spec content** — a linked GitHub issue (resolved via the
   generalized `#123` / `closes #123` regex, now scanned across body, title, AND
   branch name) or a best-effort fetch of a non-issue URL found in the
   description. When present, this is the most authoritative signal: it should
   directly shape `in_scope` / `out_of_scope`, not just the one-line `intent`.
3. **Commit messages** and **touched file paths** — mid-strength, code-derived
   signals.
4. **Branch name** and **PR title** — the weakest signal, used mainly when
   everything else is thin.

All of the above are the PR author's own words or the repo's own commit
history — untrusted content, delimiter-wrapped (`wrapUntrusted`) exactly like
`PR description` is in the main reviewer prompt.

## The output schema is NOT in the prompt

Same convention as [`README.md`](./README.md): the `{ intent, in_scope,
out_of_scope, confidence, category }` shape is enforced out of band by the
`Intent` Zod schema (field guidance lives in each field's `.describe()`), not
by prose in this prompt. Do not restate field names or a JSON layout here.

## Category

Exactly one of: `feat`, `fix`, `refactor`, `perf`, `chore`, `docs`, `test`,
`style`, `build`, `ci`, `security` — the single best-fitting category for the
PR's primary change (a bugfix with a small accompanying test is still `fix`).

## Confidence calibration

`confidence` reflects how much EXPLICIT, unambiguous context grounded the
inference — not how clear the inferred intent reads once written down. A
confident-sounding one-liner inferred purely from a branch name is still LOW
confidence.

| Band | When |
|---|---|
| **0.85+** | An explicit, unambiguous linked spec/ticket or a clear, detailed PR description is present — little inference required. |
| **0.5 – 0.84** | A PR description is present, but some inference fills the gaps (vague description, no linked ticket, or a ticket that only partially covers the diff). |
| **below 0.5** | Little to no explicit context — intent mostly inferred from branch name, commit messages, or touched file paths alone. |

This mirrors the numeric-band convention used by the conventions extractor
(`server/src/modules/conventions/prompt.ts`) — explicit bands, not a vague
"be careful" instruction, because models default to overconfidence otherwise.

## In scope / out of scope

`in_scope` and `out_of_scope` are concrete, reviewer-usable bullets — "adds
rate limiting to `/auth/login`", not "improves security" — so a later reviewer
agent can flag scope creep against them (`## PR intent` section of the main
review prompt). When a linked ticket/spec was fetched, its stated
acceptance criteria / requirements should populate these lists directly.

## Model

Defaults to the cheap tier (`openrouter` / `deepseek/deepseek-v4-flash`, same
as `onboarding` — see [`choosing-a-model.md`](./choosing-a-model.md)):
intent classification is a low-stakes, high-volume call (once per run) where a
wrong category or a slightly generic `intent` string is a minor loss, unlike a
missed CRITICAL security finding. Override per workspace via Settings
(`review_intent` in `FEATURE_MODELS`).
