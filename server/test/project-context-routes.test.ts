import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

describe('project-context routes (no DB)', () => {
  it('registers read routes + PUT attachments only; nothing writes to the clone docs', async () => {
    const app = await buildApp({ config });
    const printed = app.printRoutes({ commonPrefix: false });
    expect(printed).toContain('context/docs');
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const res = await app.inject({ method: method as 'POST', url: '/repos/00000000-0000-0000-0000-000000000000/context/docs' });
      expect(res.statusCode).toBe(404);
    }
    await app.close();
  });

  it('GET content without a path answers 400 invalid_path', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'GET',
      url: '/repos/00000000-0000-0000-0000-000000000000/context/docs/content',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_path');
    await app.close();
  });

  it('PUT with a malformed body answers 400', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'PUT',
      url: '/agents/00000000-0000-0000-0000-000000000000/context',
      payload: { paths: 'nope' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
