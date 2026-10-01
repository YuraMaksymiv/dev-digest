import { describe, expect, it } from 'vitest';
import { ApiError } from '../../ports.js';
import { HttpDevDigestApi } from './client.js';

const silent = { debug() {}, info() {}, warn() {}, error() {} };
const BASE = 'http://127.0.0.1:3001';

function api(fetchImpl: typeof fetch) {
  return new HttpDevDigestApi({ baseUrl: `${BASE}/`, requestTimeoutMs: 5000, logger: silent, fetch: fetchImpl });
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const failWith = (fn: () => Promise<unknown>) => fn().then(() => undefined, (e: unknown) => e as ApiError);

describe('HttpDevDigestApi error mapping', () => {
  it('maps ECONNREFUSED to the dev.sh hint', async () => {
    const refused = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    const err = await failWith(() => api(() => Promise.reject(refused)).listAgents());
    expect(err).toBeInstanceOf(ApiError);
    expect(err?.kind).toBe('unreachable');
    expect(err?.message).toBe(`DevDigest API not reachable at ${BASE}; run ./scripts/dev.sh`);
  });

  it('maps a request timeout', async () => {
    const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' });
    const err = await failWith(() => api(() => Promise.reject(timeout)).listAgents());
    expect(err?.kind).toBe('timeout');
  });

  it('passes the server message through on 404', async () => {
    const err = await failWith(() =>
      api(async () => json({ error: { code: 'not_found', message: 'PR #9 is not imported for a/b. Import it in the DevDigest UI first, then retry.' } }, 404)).lookupPull('a/b', 9),
    );
    expect(err?.kind).toBe('not_found');
    expect(err?.message).toContain('PR #9 is not imported for a/b');
  });

  it.each([400, 422])('maps %i to bad_request', async (status) => {
    const err = await failWith(() => api(async () => json({ error: { message: 'bad' } }, status)).getRun('x'));
    expect(err?.kind).toBe('bad_request');
    expect(err?.message).toContain('bad');
  });

  it('maps 429 to a 30s wait', async () => {
    const err = await failWith(() => api(async () => json({}, 429)).listAgents());
    expect(err?.kind).toBe('rate_limited');
    expect(err?.message).toContain('wait 30s');
  });

  it('maps 5xx', async () => {
    const err = await failWith(() => api(async () => json({ error: { message: 'kaput' } }, 503)).listAgents());
    expect(err?.kind).toBe('server');
    expect(err?.message).toContain('HTTP 503');
  });

  it('reports a response that fails schema parsing', async () => {
    const err = await failWith(() => api(async () => json([{ nope: true }])).listAgents());
    expect(err?.kind).toBe('invalid_response');
    expect(err?.message).toContain('out of sync');
  });
});

describe('HttpDevDigestApi requests', () => {
  it('ignores unknown fields and maps wire to domain shape', async () => {
    const run = await api(async () =>
      json({ run_id: 'r', status: 'done', pr_id: 'p', pr_number: 3, repo: 'a/b', extra: 1, agent_name: null }),
    ).getRun('r');
    expect(run).toMatchObject({ runId: 'r', status: 'done', prNumber: 3, agentName: null, error: null });
  });

  it('posts agentId when starting a review and encodes lookup query', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const client = api(async (url, init) => {
      seen.push({ url: String(url), init });
      return String(url).includes('lookup')
        ? json({ pr_id: 'p', repo: 'a/b', number: 4, title: 't' })
        : json({ pr_id: 'p', runs: [{ run_id: 'r1', agent_id: 'ag', agent_name: 'N' }], reviews: [] });
    });
    await client.lookupPull('a/b', 4);
    const started = await client.startReview('p', 'ag');

    expect(seen[0]!.url).toBe(`${BASE}/pulls/lookup?repo=a%2Fb&number=4`);
    expect(seen[1]!.init?.body).toBe(JSON.stringify({ agentId: 'ag' }));
    expect(started).toEqual({ runId: 'r1', agentId: 'ag', agentName: 'N' });
  });

  it('keeps accepted conventions only', async () => {
    const rows = await api(async () =>
      json([
        { category: 'naming', rule: 'a', confidence: 1, status: 'accepted' },
        { category: 'naming', rule: 'b', confidence: 1, status: 'pending' },
      ]),
    ).listConventions('r');
    expect(rows.map((r) => r.rule)).toEqual(['a']);
  });
});

describe('HttpDevDigestApi.waitForRun', () => {
  const sse = (chunks: string[]) =>
    new Response(
      new ReadableStream({
        start(c) {
          for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk));
          c.close();
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    );

  it('streams event messages (split across chunks) and ends when the stream closes', async () => {
    const seen: string[] = [];
    const result = await api(async () =>
      sse([': ping\n\nid: 1\nevent: info\ndata: {"msg":"loa', 'ding"}\n\nid: 2\nevent: result\ndata: {"msg":"done"}\n\n']),
    ).waitForRun('r', { signal: new AbortController().signal, onEvent: (e) => seen.push(e.message) });

    expect(result).toBe('ended');
    expect(seen).toEqual(['loading', 'done']);
  });

  it('returns aborted when the signal fires', async () => {
    const controller = new AbortController();
    const hanging = (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_res, rej) =>
        init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))),
      );
    const pending = api(hanging as typeof fetch).waitForRun('r', { signal: controller.signal });
    controller.abort();
    expect(await pending).toBe('aborted');
  });

  it('maps a non-2xx response', async () => {
    const err = await failWith(() => api(async () => json({ error: { message: 'nope' } }, 404)).waitForRun('r', { signal: new AbortController().signal }));
    expect(err?.kind).toBe('not_found');
  });
});
