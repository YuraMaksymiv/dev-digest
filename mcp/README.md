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

## Install and run

```bash
pnpm --dir mcp install
./scripts/dev.sh --no-client        # API on :3001
pnpm --dir mcp start                # stdio server (normally launched by the client)
```

The repo-root `.mcp.json` registers the server as `devdigest` for Claude Code
(`mcp/node_modules/.bin/tsx mcp/src/index.ts`, `timeout` 140000 ms so the 120s
wait fits). Approve the project server in Claude Code on first use.

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
