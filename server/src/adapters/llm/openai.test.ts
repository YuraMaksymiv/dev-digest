import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const create = vi.fn();
vi.mock('openai', () => ({ default: class { chat = { completions: { create } }; } }));

import { OpenAIProvider } from './openai.js';

const schema = z.object({ ok: z.boolean() });
const base = {
  model: 'claude-sonnet-4-5',
  schema,
  schemaName: 'T',
  messages: [{ role: 'user' as const, content: 'hi' }],
};
const good = { choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
const bad = { choices: [{ message: { content: 'nope' } }], usage: {} };

describe('OpenAIProvider single-request mode', () => {
  beforeEach(() => {
    create.mockReset();
  });

  it('passes maxRetries 0 and timeout as per-request options', async () => {
    create.mockResolvedValue(good);
    await new OpenAIProvider('k').completeStructured({ ...base, maxRetries: 0, timeoutMs: 1234 });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![1]).toEqual({ maxRetries: 0, timeout: 1234 });
  });

  it('makes exactly one request on invalid output (no repair request)', async () => {
    create.mockResolvedValue(bad);
    await expect(
      new OpenAIProvider('k').completeStructured({ ...base, maxRetries: 0, timeoutMs: 1000 }),
    ).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('makes exactly one request on 429/5xx', async () => {
    for (const status of [429, 503]) {
      create.mockReset();
      const err = Object.assign(new Error('x'), { status });
      create.mockImplementation(() => {
        throw err;
      });
      await expect(
        new OpenAIProvider('k').completeStructured({ ...base, maxRetries: 0, timeoutMs: 1000 }),
      ).rejects.toBe(err);
      expect(create).toHaveBeenCalledTimes(1);
    }
  });

  it('leaves per-request options unset when maxRetries is omitted', async () => {
    create.mockResolvedValue(good);
    await new OpenAIProvider('k').completeStructured(base);
    expect(create.mock.calls[0]![1]).toBeUndefined();
  });
});
