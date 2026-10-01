import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../ports.js';
import { FakeApi, PR_ID } from '../test-support/fake-api.js';
import { BlastService } from './blast.service.js';
import { BLAST_NO_DATA_HINT } from './constants.js';

const PAYLOAD = {
  changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
  downstream: [
    {
      symbol: 'rateLimit',
      callers: [{ name: 'router', file: 'b.ts', line: 23 }],
      endpoints_affected: ['GET /x'],
      crons_affected: [],
    },
  ],
  summary: '1 changed symbol reach 1 caller, 1 endpoint.',
};

const inner = (text: string) => text.split('\n').slice(1, -1).join('\n');

describe('BlastService', () => {
  let api: FakeApi;
  let service: BlastService;
  beforeEach(() => {
    api = new FakeApi();
    api.blast = PAYLOAD;
    service = new BlastService(api);
  });

  it('resolves the PR then relays the route JSON verbatim inside the untrusted block', async () => {
    const { text, isError } = await service.getBlastRadius('acme/widgets', 7);
    expect(isError).toBe(false);
    expect(api.calls).toEqual(['lookupPull acme/widgets#7', `getBlastRadius ${PR_ID}`]);
    expect(text.startsWith('<untrusted_review_output>')).toBe(true);
    expect(text.endsWith('</untrusted_review_output>')).toBe(true);
    expect(JSON.parse(inner(text))).toEqual(PAYLOAD);
  });

  it('adds the open-the-PR hint outside the block on no_data', async () => {
    api.blast = { ...PAYLOAD, degraded: true, reason: 'no_data' };
    const { text } = await service.getBlastRadius('acme/widgets', 7);
    expect(text.startsWith(`${BLAST_NO_DATA_HINT}\n<untrusted_review_output>`)).toBe(true);
    expect(text).toContain('Open the PR in DevDigest once');
  });

  it('does not add the hint for other degraded reasons', async () => {
    api.blast = { ...PAYLOAD, degraded: true, reason: 'index_partial' };
    const { text } = await service.getBlastRadius('acme/widgets', 7);
    expect(text.startsWith('<untrusted_review_output>')).toBe(true);
  });

  it('propagates API errors so the tool maps them to isError', async () => {
    api.blastError = new ApiError('not_found', 'Not found: Pull request not found');
    await expect(service.getBlastRadius('acme/widgets', 7)).rejects.toThrow('Pull request not found');
  });
});
