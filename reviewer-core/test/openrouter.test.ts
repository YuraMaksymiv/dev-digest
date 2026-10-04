import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const create = vi.fn();
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import { OpenRouterProvider } from '../src/llm/openrouter.js';

const schema = z.object({ ok: z.boolean() });
const base = {
  model: 'm',
  schema,
  schemaName: 'T',
  messages: [{ role: 'user' as const, content: 'hi' }],
};
const good = { choices: [{ message: { content: '{"ok":true}' } }], usage: {} };

describe('OpenRouterProvider single-request mode', () => {
  beforeEach(() => {
    create.mockReset();
  });

  it('passes maxRetries 0 and timeout as per-request options', async () => {
    create.mockResolvedValue(good);
    await new OpenRouterProvider('k').completeStructured({ ...base, maxRetries: 0, timeoutMs: 1234 });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![1]).toEqual({ maxRetries: 0, timeout: 1234 });
  });

  it('makes exactly one request on invalid JSON (no repair request)', async () => {
    create.mockResolvedValue({ choices: [{ message: { content: 'nope' } }], usage: {} });
    await expect(
      new OpenRouterProvider('k').completeStructured({ ...base, maxRetries: 0, timeoutMs: 1000 }),
    ).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each([429, 503])('makes exactly one request on HTTP %i', async (status) => {
    const err = Object.assign(new Error('x'), { status });
    create.mockRejectedValue(err);
    await expect(
      new OpenRouterProvider('k').completeStructured({ ...base, maxRetries: 0, timeoutMs: 1000 }),
    ).rejects.toBe(err);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('leaves per-request options unset when maxRetries is omitted', async () => {
    create.mockResolvedValue(good);
    await new OpenRouterProvider('k').completeStructured(base);
    expect(create.mock.calls[0]![1]).toBeUndefined();
  });
});
