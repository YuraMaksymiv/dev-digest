import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PrBriefResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { createBriefServiceGetter } from './wiring.js';

/**
 * PR Brief (per pull request).
 *   GET  /pulls/:id/brief → cached brief with `stale`, or null; never a model call
 *   POST /pulls/:id/brief → the single paid generation (no auto-retry)
 *
 * An unknown PR answers 404; a model/validation failure answers an error and
 * leaves the cached brief untouched.
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  const svc = createBriefServiceGetter(container);

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams } },
    async (req): Promise<PrBriefResponse | null> => {
      const { workspaceId } = await getContext(container, req);
      return svc().get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/brief',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req): Promise<PrBriefResponse> => {
      const { workspaceId } = await getContext(container, req);
      return svc().generate(workspaceId, req.params.id, (ws) =>
        resolveFeatureModel(container, ws, 'risk_brief'),
      );
    },
  );
}
