# reviewer-core/ — @devdigest/reviewer-core

Pure review engine: diff → prompt → LLM → grounded findings. No DB, no
GitHub, no filesystem — the only side effect is an LLM call through an
injected `LLMProvider`. Pipeline diagram: [README.md](README.md).

## Stack

TypeScript 5.7 · Zod 3 · `openai` SDK (used as an OpenRouter-compatible
client) · Vitest.

## Commands

- `pnpm test` — vitest, hermetic (stubbed `LLMProvider`, no keys/network)
- `pnpm typecheck` — this **is** the build (`build` script = `tsc --noEmit`;
  no emitted JS)

## Map

- `src/prompt.ts` — `assemblePrompt` / `wrapUntrusted`.
- `src/grounding.ts` — the citation gate (`groundFindings`).
- `src/llm/` — provider + structured-output parsing (Zod → JSON Schema,
  parse-with-repair).
- `src/review/run.ts` — orchestrates a single-pass run; `reduce.ts` —
  map-reduce path (used from L06+).
- `src/output/to-review.ts` — CI payload shaping (used from L06).

## Non-default conventions

- Consumed as **TypeScript source** via a tsconfig path alias, not a built
  package — server and CI run `tsx`/vitest directly against `src/`.
- Grounding is mandatory and mechanical: a finding without a real diff-line
  citation is dropped; the score is recomputed from surviving findings,
  never trusted from the model.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`) exist for
  later course lessons — an omitted slot just drops its prompt section,
  don't add fallback logic for it.

## Gotchas

- Any change to the `Review` / `Finding` / `Verdict` shape must go through
  `@devdigest/shared`, not a local type — server and client both import
  those contracts from there.

## More

[docs/](docs/) · [specs/](specs/) · [INSIGHTS.md](INSIGHTS.md)
