import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from '../server.js';
import { FakeApi } from '../test-support/fake-api.js';
import { connectInMemory, type RpcSession } from '../test-support/rpc.js';

const silent = { debug() {}, info() {}, warn() {}, error() {} };

const INSTRUCTIONS =
  'DevDigest reviews GitHub PRs that are already imported into the local DevDigest app. Workflow: list_agents → run_agent_on_pr (blocks up to 120s) → if status=running, poll get_findings(run_id). `repo` is always "owner/name". `agent` accepts a name or id from list_agents. Errors include a next step — follow it instead of retrying blindly.';

const DESCRIPTIONS: Record<string, string> = {
  list_agents:
    'List the reviewer agents configured in DevDigest (name, id, enabled, one-line focus). Use a name or id from here as `agent` in run_agent_on_pr.',
  run_agent_on_pr:
    'Run one reviewer agent on an imported pull request and wait up to 120s for it to finish. Returns a findings summary, or run_id with status=running if still in progress — then call get_findings.',
  get_findings:
    'Get the status and findings of a review run by run_id. Returns status=running until done; results are paginated (use cursor) and response_format=detailed adds rationale and fix suggestions.',
  get_conventions:
    'Get the accepted coding conventions DevDigest applies when reviewing a repo, one line per rule. Use `section` to narrow the output.',
  get_blast_radius: 'NOT IMPLEMENTED YET — always returns an error. Do not call; use get_findings instead.',
};

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const ANNOTATIONS: Record<string, unknown> = {
  list_agents: READ_ONLY,
  run_agent_on_pr: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  get_findings: READ_ONLY,
  get_conventions: READ_ONLY,
  get_blast_radius: READ_ONLY,
};

// zod's JSON Schema emitter escapes the slash; the pattern is semantically ^[^/\s]+/[^/\s]+$.
const REPO = { type: 'string', pattern: '^[^/\\s]+\\/[^/\\s]+$', description: 'owner/name' };

let session: RpcSession | undefined;
afterEach(async () => {
  await session?.close();
  session = undefined;
});

async function listTools(enableStubs: boolean) {
  session = await connectInMemory(createServer({ api: new FakeApi(), logger: silent, enableStubs }));
  const result = await session.request('tools/list');
  const init = await session.request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '0.0.0' },
  });
  return { tools: result.tools as Record<string, any>[], instructions: init.instructions as string };
}

const estimateTokens = (tools: unknown, instructions: string) =>
  Math.ceil((JSON.stringify(tools).length + instructions.length) / 4);

describe('tools/list', () => {
  it('registers the four tools in fixed order with exact copy and annotations', async () => {
    const { tools, instructions } = await listTools(false);

    expect(tools.map((t) => t.name)).toEqual(['list_agents', 'run_agent_on_pr', 'get_findings', 'get_conventions']);
    expect(instructions).toBe(INSTRUCTIONS);
    for (const t of tools) {
      expect(t.description).toBe(DESCRIPTIONS[t.name]);
      expect(t.annotations).toEqual(ANNOTATIONS[t.name]);
    }
  });

  it('adds get_blast_radius last, with exact copy, only when stubs are enabled', async () => {
    const { tools } = await listTools(true);

    expect(tools.map((t) => t.name)).toEqual([
      'list_agents',
      'run_agent_on_pr',
      'get_findings',
      'get_conventions',
      'get_blast_radius',
    ]);
    const stub = tools[4]!;
    expect(stub.description).toBe(DESCRIPTIONS.get_blast_radius);
    expect(stub.annotations).toEqual(READ_ONLY);

    const res = await session!.request('tools/call', { name: 'get_blast_radius', arguments: { repo: 'a/b', pr_number: 1 } });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe(
      'get_blast_radius is not implemented yet; no data exists. Do not retry — use get_findings instead.',
    );
  });

  it('exposes the exact flat input schemas', async () => {
    const { tools } = await listTools(true);
    const props = (name: string) => tools.find((t) => t.name === name)!.inputSchema.properties;
    const required = (name: string) => tools.find((t) => t.name === name)!.inputSchema.required ?? [];

    expect(props('list_agents')).toEqual({});
    expect(props('run_agent_on_pr')).toMatchObject({
      repo: REPO,
      pr_number: { type: 'integer' },
      agent: { type: 'string', description: 'Agent name or id from list_agents' },
    });
    expect(required('run_agent_on_pr').sort()).toEqual(['agent', 'pr_number', 'repo']);
    expect(Object.keys(props('run_agent_on_pr'))).toEqual(['repo', 'pr_number', 'agent']);
    expect(props('get_findings')).toMatchObject({
      run_id: { type: 'string' },
      severity: { type: 'string', enum: ['CRITICAL', 'WARNING', 'SUGGESTION'] },
      response_format: { type: 'string', enum: ['concise', 'detailed'], default: 'concise' },
      limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      cursor: { type: 'string', description: 'From the previous response' },
    });
    expect(required('get_findings')).toEqual(['run_id']);
    expect(props('get_conventions')).toMatchObject({
      repo: REPO,
      section: {
        type: 'string',
        enum: ['naming', 'structure', 'error_handling', 'async', 'typing', 'testing', 'imports', 'api'],
      },
    });
    expect(props('get_blast_radius')).toMatchObject({ repo: REPO, pr_number: { type: 'integer' } });
  });

  it('has no outputSchema, $defs or $ref', async () => {
    const { tools } = await listTools(true);
    const json = JSON.stringify(tools);

    expect(tools.every((t) => t.outputSchema === undefined)).toBe(true);
    expect(json).not.toContain('$defs');
    expect(json).not.toContain('$ref');
  });

  it.each([false, true])('stays within the 1500 token budget (stubs=%s)', async (stubs) => {
    const { tools, instructions } = await listTools(stubs);
    const tokens = estimateTokens(tools, instructions);

    expect(tokens).toBeLessThanOrEqual(1500);
  });
});
