import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { PullService } from './service.js';

export const Severity = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
export type Severity = z.infer<typeof Severity>;

type WebhookPayload = {
  action: 'opened' | 'synchronize' | 'closed';
  number: number;
  repository: { full_name: string };
};

export const pullFilterRoutes =
  (service: PullService): FastifyPluginAsync =>
  async (app) => {
    app.get('/repos/:repoId/pulls', async (req, reply) => {
      const Query = z
        .object({
          page: z.number().int().min(1).default(1),
          limit: z.number().int().min(1).max(100).default(20),
          severity: Severity.optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        })
        .refine((q) => {
          if (q.from && q.to && q.from > q.to) {
            throw new Error('from must be before to');
          }
          return true;
        });

      const result = Query.safeParse(req.query);
      if (!result.success) {
        return reply.status(400).send({ error: result.error.issues[0].message });
      }
      return service.list((req.params as { repoId: string }).repoId, result.data);
    });

    app.post('/webhooks/github', async (req, reply) => {
      const raw = req.headers['x-raw-body'] as string;
      const payload = JSON.parse(raw) as WebhookPayload;
      if (payload.action === 'opened' || payload.action === 'synchronize') {
        await service.enqueueSync(payload.repository.full_name, payload.number);
      }
      return reply.status(202).send();
    });
  };
