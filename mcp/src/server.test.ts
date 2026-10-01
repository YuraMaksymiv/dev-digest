import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from './ports.js';
import { createServer } from './server.js';
import { FakeApi, RUN_ID, review, runDetail } from './test-support/fake-api.js';
import { connectInMemory, type RpcSession } from './test-support/rpc.js';

const logged: string[] = [];
const logger = {
  debug() {},
  info() {},
  warn() {},
  error: (m: string) => void logged.push(m),
};

let session: RpcSession | undefined;
afterEach(async () => {
  await session?.close();
  session = undefined;
  logged.length = 0;
});

async function start(api: FakeApi) {
  session = await connectInMemory(createServer({ api, logger, enableStubs: false }));
  return session;
}
const call = (s: RpcSession, name: string, args: Record<string, unknown>, meta?: Record<string, unknown>) =>
  s.request('tools/call', { name, arguments: args, ...(meta ? { _meta: meta } : {}) });

describe('tool transport', () => {
  it('returns text content for a happy path', async () => {
    const api = new FakeApi();
    api.reviews = [review([])];
    const s = await start(api);
    const res = await call(s, 'run_agent_on_pr', { repo: 'acme/widgets', pr_number: 7, agent: 'General Reviewer' });
    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).toContain('status=done');
  });

  it('returns the dev.sh hint as isError when the API is down', async () => {
    const api = new FakeApi();
    api.listAgents = async () => {
      throw new ApiError('unreachable', 'DevDigest API not reachable at http://127.0.0.1:3001; run ./scripts/dev.sh');
    };
    const s = await start(api);
    const res = await call(s, 'list_agents', {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe('DevDigest API not reachable at http://127.0.0.1:3001; run ./scripts/dev.sh');
  });

  it('returns not-found hints as isError', async () => {
    const api = new FakeApi();
    api.lookupError = new ApiError('not_found', 'Not found: Repo x/y is not imported. Import it in the DevDigest UI first, then retry.');
    const s = await start(api);
    const res = await call(s, 'run_agent_on_pr', { repo: 'x/y', pr_number: 1, agent: 'General Reviewer' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Import it in the DevDigest UI');
  });

  it('rejects invalid arguments without calling the API', async () => {
    const api = new FakeApi();
    const s = await start(api);
    const outcome = await call(s, 'run_agent_on_pr', { repo: 'not-a-repo', pr_number: 0, agent: 'x' }).then(
      (r) => ({ isError: r.isError === true, text: JSON.stringify(r) }),
      (e: Error) => ({ isError: true, text: e.message }),
    );
    expect(outcome.isError).toBe(true);
    expect(outcome.text.toLowerCase()).toMatch(/repo|pr_number|invalid/);
    expect(api.calls).toEqual([]);
  });

  it('applies get_findings defaults', async () => {
    const api = new FakeApi();
    api.reviews = [review([])];
    const s = await start(api);
    const res = await call(s, 'get_findings', { run_id: RUN_ID });
    expect(res.content[0].text).toContain('No findings to show');
  });

  it('maps a non-uuid run_id to an isError next step', async () => {
    const s = await start(new FakeApi());
    const res = await call(s, 'get_findings', { run_id: 'nope' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Invalid run_id');
  });

  it('hides unexpected failures behind a generic error and logs them', async () => {
    const api = new FakeApi();
    api.listAgents = async () => {
      throw new Error('secret internals');
    };
    const s = await start(api);
    const res = await call(s, 'list_agents', {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).not.toContain('secret internals');
    expect(logged).toContain('unexpected tool failure');
  });

  it('sends progress notifications only when a progressToken is given', async () => {
    const api = new FakeApi();
    api.run = runDetail({ status: 'running' });
    api.wait = async (_id, { onEvent }) => {
      onEvent?.({ message: 'loading diff' });
      onEvent?.({ message: 'calling model' });
      return 'ended';
    };
    const s = await start(api);

    await call(s, 'run_agent_on_pr', { repo: 'acme/widgets', pr_number: 7, agent: 'a-general' });
    expect(s.notifications.filter((n) => n.method === 'notifications/progress')).toHaveLength(0);

    await call(s, 'run_agent_on_pr', { repo: 'acme/widgets', pr_number: 7, agent: 'a-general' }, { progressToken: 'tok' });
    const progress = s.notifications.filter((n) => n.method === 'notifications/progress');
    expect(progress.map((n) => [n.params.progressToken, n.params.progress, n.params.message])).toEqual([
      ['tok', 1, 'loading diff'],
      ['tok', 2, 'calling model'],
    ]);
  });
});
