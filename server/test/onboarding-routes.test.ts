import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

describe('onboarding routes (no DB)', () => {
  it('AC-8: both endpoints are registered', async () => {
    const app = await buildApp({ config });
    const printed = app.printRoutes({ commonPrefix: false });
    expect(printed).toContain('onboarding');
    expect(printed).toContain('generate');
    await app.close();
  });

  it.each([
    ['GET', '/repos/not-a-uuid/onboarding'],
    ['POST', '/repos/not-a-uuid/onboarding/generate'],
  ] as const)('AC-8: %s with a malformed repo id is rejected by validation before any DB access', async (method, url) => {
    const app = await buildApp({ config });
    const res = await app.inject({ method, url });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    await app.close();
  });
});
