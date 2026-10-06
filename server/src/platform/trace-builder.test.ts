import { describe, it, expect } from 'vitest';
import { buildRunTrace } from './trace-builder.js';

const base = {
  config: { agent: 'a', model: 'm' },
  stats: { duration_ms: 1, tokens_in: 0, tokens_out: 0, findings: 0, grounding: '0/0 passed', cost_usd: null },
  promptAssembly: { system: 's', skills: null, memory: null, specs: null, user: 'u' },
  toolCalls: [],
  rawOutput: '',
  memoryPulled: [],
  specsRead: [],
  log: [],
};

describe('buildRunTrace specsDetail', () => {
  it('omits specs_detail when not provided', () => {
    expect('specs_detail' in buildRunTrace(base)).toBe(false);
  });
  it('carries specs_detail when provided', () => {
    const detail = [{ path: 'specs/a.md', tokens: 3, source: 'agent' as const, source_name: 'A', status: 'read' as const }];
    expect(buildRunTrace({ ...base, specsDetail: detail }).specs_detail).toEqual(detail);
  });
});
