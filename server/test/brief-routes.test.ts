import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { describe, expect, it } from 'vitest';
import briefRoutes from '../src/modules/brief/routes.js';

async function app() {
  const a = Fastify();
  a.setValidatorCompiler(validatorCompiler);
  a.setSerializerCompiler(serializerCompiler);
  await a.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  a.decorate('container', {} as never);
  await a.register(briefRoutes);
  return a;
}
const ID = '00000000-0000-4000-8000-000000000001';

describe('brief routes (hermetic)', () => {
  it('AC-18: POST /pulls/:id/brief is limited to 10 requests per minute', async () => {
    const a = await app();
    const codes: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      codes.push((await a.inject({ method: 'POST', url: `/pulls/${ID}/brief` })).statusCode);
    }
    expect(codes.slice(0, 10).every((c) => c !== 429)).toBe(true);
    expect(codes[10]).toBe(429);
    await a.close();
  });

  it('a malformed id is rejected by validation before any service is touched', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/pulls/not-a-uuid/brief' });
    expect(res.statusCode).toBe(400);
    await a.close();
  });
});
