import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { BlastRadius } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

/**
 * blast module.
 *   GET /pulls/:id/blast → BlastRadius for the PR's changed files (404 unknown PR;
 *                          a missing/failed/partial index is a 200 with `degraded` + `reason`)
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new BlastService(container);

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams } },
    async (req): Promise<BlastRadius> => {
      const { workspaceId } = await getContext(container, req);
      return service.getBlast(workspaceId, req.params.id);
    },
  );
}
