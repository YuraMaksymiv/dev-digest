# mcp/ — @devdigest/mcp

Local stdio MCP server that exposes DevDigest (agents, PR review runs,
findings, conventions) to Claude Code. A thin client of the Fastify API —
no DB, no GitHub, no LLM of its own. Tool reference: [README.md](README.md).

## Stack

`@modelcontextprotocol/server` v2 · Zod 4 · tsx · TypeScript 5.7 · Vitest.

## Commands

- `pnpm install` — first-time setup (own lockfile; the repo-root `.mcp.json` runs the local `tsx`, so Claude Code offers the server to anyone who opens the repo — see README "Run in Claude Code")
- `pnpm start` — run the stdio server by hand (`src/index.ts`)
- `pnpm test` — vitest, hermetic (fake `DevDigestApi`, in-memory MCP transport)
- `pnpm typecheck`
- `pnpm arch` — dependency-cruiser onion rules (`.dependency-cruiser.cjs`)

## Map

- `src/tools/` — transport: parse args → service → text result / `isError`.
  `copy.ts` holds EVERY model-facing string (descriptions, instructions,
  schemas, annotations) — pinned by `tools-list.test.ts`.
- `src/services/` — orchestration (resolve agent/repo/PR, run + wait, pagination).
- `src/domain/` — pure formatting, severity sort, cursor encode/decode.
- `src/ports.ts` — `DevDigestApi` interface, `ApiError`, `Logger`.
- `src/adapters/http/` — fetch + SSE client; error mapping with next-step hints.
- `src/server.ts` — composition root (`createServer(deps)`, fixed tool order).
  `src/index.ts` — stdio entry; builds the concrete adapter.
- Tests are colocated `src/**/*.test.ts`; shared fakes in `src/test-support/`.

## Non-default conventions

- **stdout is the JSON-RPC channel.** Never `console.log`; log through the
  `Logger` (stderr).
- Tool descriptions are token budget: `tools/list` + instructions must stay
  <= 1500 tokens (chars/4), asserted in `tools-list.test.ts`.
- `run_agent_on_pr` blocks up to 120s; a client abort stops the wait but does
  NOT cancel the server-side run.
- No `outputSchema`; flat input schemas only (no `$defs`/`$ref`).

## Gotchas

- `DevDigest API not reachable` → start the API (`./scripts/dev.sh`).
- The 120s wait equals Claude Code's MCP auto-background threshold; see the
  README for `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`.

## More

[INSIGHTS.md](INSIGHTS.md)
