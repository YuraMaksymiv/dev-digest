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
- 2026-10-03 — Reversed the "on demand only" setup: the server definition moved from `mcp/mcp.json` to the project-scoped repo-root `.mcp.json` (mentor feedback), so Claude Code offers it to everyone right after cloning; each user still approves it once and can disable it in `/mcp`, which keeps the token cost opt-out rather than forced. Same relative `mcp/node_modules/.bin/tsx` command, so `pnpm --dir mcp install` remains a prerequisite.
- 2026-10-03 — `get_findings` gained a whole-PR mode (`repo` + `pr_number`, mutually exclusive with `run_id`) instead of a new tool: same read-only semantics, and a sixth tool would cost more of the 1500-token `tools/list` budget than two optional fields. It keeps only the latest `kind=review` row per agent (reruns supersede) and shrinks the per-review finding cap evenly to fit `MAX_OUTPUT_CHARS`, reporting the full `findings_count`; `cursor` stays run_id-only.
