import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { resolveFeatureModel } from '../settings/feature-models.js';

/**
 * Onboarding Tour (per repo).
 *   GET  /repos/:id/onboarding           → stored tour, else deterministic skeleton
 *   POST /repos/:id/onboarding/generate  → the single paid generation (no auto-retry)
 *
 * LLM failures answer 200 with a banner; an unknown repo answers 404.
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // Resolved per request so a validation 422 never touches db-backed deps.
  const svc = () => app.container.onboardingService;

  app.get('/repos/:id/onboarding', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return svc().get(workspaceId, req.params.id);
  });

  app.post('/repos/:id/onboarding/generate', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return svc().generate(workspaceId, req.params.id, (ws) =>
      resolveFeatureModel(app.container, ws, 'onboarding'),
    );
  });
}
