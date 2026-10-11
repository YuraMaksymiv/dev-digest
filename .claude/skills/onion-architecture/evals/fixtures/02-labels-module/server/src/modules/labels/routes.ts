import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { LabelService } from './service.js';
import { ReplaceLabelsInput } from './constants.js';

export default async function labelsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new LabelService(app.container);

  app.get('/pulls/:id/labels', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.put(
    '/pulls/:id/labels',
    { schema: { params: IdParams, body: ReplaceLabelsInput } },
    async (req, reply) => {
      const { workspaceId, userId } = await getContext(app.container, req);
      return service.replace(workspaceId, userId, req.params.id, req.body.labels, reply);
    },
  );
}
