# Insights — reviewer-core/

Non-obvious things learned while building `reviewer-core/`. Captured by the
[`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md)
skill. Append-only — correct a stale entry with a new dated note, never
rewrite it. Anti-banality test: if the code alone already tells the story,
skip it.

## What Works

## What Doesn't Work

## Codebase Patterns & Tool/Library Notes
- 2026-10-04 — `OpenRouterProvider` builds its OpenAI SDK client once with `maxRetries: opts.maxRetries ?? 2` (HTTP retries on 429/5xx/timeouts) — `req.maxRetries` alone does not stop them. With `req.maxRetries === 0` the provider now passes per-request `{maxRetries: 0, timeout: req.timeoutMs}` as `create`'s 2nd arg and honours `req.timeoutMs`; omitting `maxRetries` keeps old behaviour. Evidence: `src/llm/openrouter.ts`, `test/openrouter.test.ts`. Cross-cutting: server adapters got the same change (see server/INSIGHTS.md).

## Decisions

## Recurring Errors & Fixes

## Session Notes

## Open Questions
