# Insights — mcp/

Non-obvious things learned while building `mcp/`. Captured by the
[`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md)
skill. Append-only — correct a stale entry with a new dated note, never
rewrite it. Anti-banality test: if the code alone already tells the story,
skip it.

## What Works

## What Doesn't Work

## Codebase Patterns & Tool/Library Notes

- 2026-10-01 — `@modelcontextprotocol/server` v2 has no bundled test client: for hermetic tests, link `InMemoryTransport.createLinkedPair()` (exported from the server package), `server.connect()` one end and drive raw JSON-RPC on the other (`src/test-support/rpc.ts`). Tool handlers get `(args, ctx)`; progress goes out via `ctx.mcpReq.notify({ method: 'notifications/progress', ... })` with `ctx.mcpReq._meta?.progressToken`, and `ctx.mcpReq.signal` is the client-abort signal. The stdio entry is `serveStdio(factory)` from `@modelcontextprotocol/server/stdio`.
- 2026-10-01 — zod 4's JSON Schema emitter writes `regex(/^[^/\s]+\/[^/\s]+$/)` as `^[^/\\s]+\\/[^/\\s]+$` (escaped slash) — equivalent, but an exact-string test must expect the escaped form.
- 2026-10-01 — `pnpm install` in a fresh package fails with ERR_PNPM_IGNORED_BUILDS (esbuild) and writes a placeholder `pnpm-workspace.yaml`; set `allowBuilds: { esbuild: false }` (esbuild ships its binary as an optional dependency, no build script needed).

## Decisions

- 2026-10-01 — `run_agent_on_pr` blocks up to 120s on the existing SSE stream (`GET /runs/:id/events`) instead of polling; after the stream ends or the wait times out it re-reads `GET /runs/:id` for the authoritative status. 120s equals Claude Code's MCP auto-background threshold, so very long runs may land in `/tasks`; `get_findings(run_id)` always works afterwards because a client abort never cancels the server run.
- 2026-10-01 — Everything the model reads in `run_agent_on_pr` / `get_findings` output (finding title/rationale/fix, review summary, run failure reason) is PR-derived, so it can carry indirect prompt injection into the calling agent. `domain/untrusted.ts` frames it in `<untrusted_review_output>` (closing tag defused, size counted in `MAX_OUTPUT_CHARS`); status, run_id, cursor and next-step hints stay outside so only our own text is trusted. Agent names/descriptions and accepted conventions are not framed yet.
