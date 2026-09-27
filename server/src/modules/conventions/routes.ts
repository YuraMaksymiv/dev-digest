import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionStatus } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module.
 *   GET    /repos/:id/conventions          → candidates for the repo (strongest first)
 *   POST   /repos/:id/conventions/extract  → one scan; costs a model call
 *   POST   /repos/:id/conventions/skill    → skill DRAFT from the accepted set
 *   PATCH  /conventions/:id                → accept / reject / edit rule + rationale
 *   DELETE /conventions/:id                → drop a candidate
 *
 * `…/skill` is a POST that writes nothing: it returns a draft for the user to
 * edit, and `POST /skills` is what persists it.
 */

const PatchConventionBody = z
  .object({
    rule: z.string().min(1).optional(),
    rationale: z.string().optional(),
    status: ConventionStatus.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' });

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.extract(workspaceId, req.params.id);
  });

  app.post('/repos/:id/conventions/skill', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.skillDraft(workspaceId, req.params.id);
  });

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: PatchConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const updated = await service.patch(workspaceId, req.params.id, req.body);
      if (!updated) throw new NotFoundError('Convention not found');
      return updated;
    },
  );

  app.delete('/conventions/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.remove(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Convention not found');
    return { ok: true };
  });
}
