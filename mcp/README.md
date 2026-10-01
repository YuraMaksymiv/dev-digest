# @devdigest/mcp

Local stdio [MCP](https://modelcontextprotocol.io) server that lets Claude Code
drive DevDigest: list review agents, run one on an already-imported PR, read
paginated findings, and read a repo's accepted conventions. It is a thin client
of the DevDigest API (`DEVDIGEST_API_URL`); it needs the API running.

## Tools

| Tool | What it does |
|---|---|
| `list_agents` | Agents with name, id, enabled, one-line focus. |
| `run_agent_on_pr(repo, pr_number, agent)` | Starts a review and **blocks up to 120s** (via the run's SSE stream, with progress notifications when the client sends a `progressToken`). Done: concise findings summary. Still running: `run_id` + `status=running`, then call `get_findings`. A client abort stops the wait but does not cancel the run. |
| `get_findings(run_id, severity?, response_format?, limit?, cursor?)` | Status + findings, severity-sorted, paginated (default 10, max 50). `response_format=detailed` adds rationale and fixes. |
| `get_conventions(repo, section?)` | Accepted conventions, one line per rule. |
| `get_blast_radius(repo, pr_number)` | Blast radius of an imported PR as JSON (changed symbols, callers as file:line, endpoints/crons), wrapped in `<untrusted_review_output>`. `degraded` + `reason` flag best-effort data; `no_data` means open the PR in DevDigest once (its changed files load on first open) and resync the index. |

`repo` is always `owner/name`; the PR must already be imported in DevDigest.
All copy lives in `src/tools/copy.ts`.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://127.0.0.1:3001` | DevDigest API base URL |
| `DEVDIGEST_REQUEST_TIMEOUT_MS` | `15000` | Per-request HTTP timeout (not the run wait) |
| `MCP_LOG_LEVEL` | `info` | `error`/`warn`/`info`/`debug`; logs go to stderr only |

## Setup from scratch

The MCP server is **not** part of `./scripts/dev.sh`: the script neither installs
`mcp/` deps nor starts it. There is also no `.mcp.json` at the repo root, so a
Claude Code session in this repo does not spawn it automatically. It is a stdio
server — it never runs as a daemon; the MCP client spawns it for one session
and kills it when the session ends. "Starting it" therefore means opening a
Claude Code session with it enabled.

Prerequisites: Node ≥ 22, pnpm ≥ 10, Docker running, Claude Code CLI (`claude`).
All commands run from the repo root.

1. **Backend env** — `cp server/.env.example server/.env` (dev.sh does this on
   first run) and set an LLM key (`OPENROUTER_API_KEY` / `OPENAI_API_KEY` /
   `ANTHROPIC_API_KEY`) plus `GITHUB_TOKEN` for importing PRs.
2. **Start the API** (Postgres + migrations + seed + API on :3001):
   ```bash
   ./scripts/dev.sh --no-client
   ```
   Use plain `./scripts/dev.sh` if you also want the UI on :3000 (needed to import
   repos/PRs). Check: `curl -s http://127.0.0.1:3001/agents` returns JSON.
3. **Import a repo and a PR** in the DevDigest UI. The MCP tools only work on
   already-imported PRs.
4. **Install MCP deps** (once, and again after `mcp/package.json` changes):
   ```bash
   pnpm --dir mcp install
   ```
5. **Smoke test without Claude** (optional) — MCP Inspector in the browser:
   ```bash
   npx @modelcontextprotocol/inspector mcp/node_modules/.bin/tsx mcp/src/index.ts
   ```
   Call `list_agents`; with the API down you get an `isError` with the dev.sh hint.

## Run on demand

`mcp/mcp.json` holds the server definition (`devdigest`, local `tsx`,
`DEVDIGEST_API_URL`, `timeout` 140000 ms so the 120s wait fits). Pick one way:

- **Per session (recommended)** — only this `claude` session gets the server:
  ```bash
  claude --mcp-config mcp/mcp.json
  ```
  Without the flag, sessions have no DevDigest tools and spend no tokens on them.
- **Register until you remove it** — local scope, only you, only this repo:
  ```bash
  claude mcp add devdigest -e DEVDIGEST_API_URL=http://127.0.0.1:3001 -- mcp/node_modules/.bin/tsx mcp/src/index.ts
  ```
  Remove with `claude mcp remove devdigest`. This registration has no per-server
  `timeout`; Claude Code's default tool timeout is far above 120s, so that is fine.

Verify inside the session with `/mcp` (server `devdigest` connected) and
`/context` (the "MCP tools" line). Paths are relative — launch `claude` from the
repo root. The API from step 2 must be running before you call a tool; the MCP
server itself starts fine without it and reports the outage per call.

Stop: end the Claude session (or `claude mcp remove devdigest`). Stop the API
with Ctrl-C in the dev.sh terminal; Postgres keeps running (`docker compose stop`).

Run it standalone for debugging only (it waits for JSON-RPC on stdin):
```bash
pnpm --dir mcp start
```

## Development

```bash
pnpm --dir mcp typecheck
pnpm --dir mcp test     # hermetic: fake DevDigestApi + in-memory MCP transport
pnpm --dir mcp arch     # onion layering rules
```

Tests are colocated (`src/**/*.test.ts`); shared fakes are in `src/test-support/`.

## Measuring token cost

`tools-list.test.ts` asserts `tools/list` + server instructions stay within
1500 tokens (chars / 4).
For a real measurement:

- MCP Inspector: `npx @modelcontextprotocol/inspector mcp/node_modules/.bin/tsx mcp/src/index.ts`
  then copy the `tools/list` JSON and count it with your tokenizer.
- In Claude Code run `/context` and read the "MCP tools" line.

## Long runs and Claude Code's auto-background

The 120s wait sits exactly at Claude Code's MCP auto-background threshold. A
call that crosses it may be moved to the background and its result appear in
`/tasks`. Raise the threshold with `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`
(milliseconds, set in the environment that launches Claude Code) if you see this.
Either way `get_findings(run_id)` works afterwards, since the run keeps going on
the server.

## Layout

See [CLAUDE.md](CLAUDE.md). Layers: `tools/` -> `services/` -> `domain/` ->
`ports.ts` <- `adapters/http/`; `server.ts` is the composition root.
