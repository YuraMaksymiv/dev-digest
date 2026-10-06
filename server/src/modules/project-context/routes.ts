import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ContextAttachmentPut } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { AppError } from '../../platform/errors.js';
import type { OwnerKind } from './repository.js';

/**
 * Project Context module (view-only over the repo clone).
 *   GET /repos/:repoId/context/docs                → candidate markdown docs
 *   GET /repos/:repoId/context/docs/content?path=  → one doc's text
 *   GET /agents/:id/context?repo_id=               → agent attachments (ordered)
 *   PUT /agents/:id/context                        → replace agent attachments
 *   GET /skills/:id/context?repo_id=               → skill attachments (ordered)
 *   PUT /skills/:id/context                        → replace skill attachments
 *   POST /repos/:repoId/context/reindex            → 202, queue a repo-intel resync (no LLM)
 *
 * No route writes to the clone. Query/body are `safeParse`d locally so
 * failures answer 400 (the schema-driven path would answer 422).
 */

const RepoParams = z.object({ repoId: z.string().uuid() });
const ContentQuery = z.object({ path: z.string().min(1) });
const OwnerQuery = z.object({ repo_id: z.string().uuid() });

function badRequest(code: string, message: string): AppError {
  return new AppError(code, message, 400);
}

export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // Resolved per request (not at registration) so validation 400s never touch db-backed deps.
  const svc = () => app.container.projectContextService;

  app.get('/repos/:repoId/context/docs', { schema: { params: RepoParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return svc().listDocs(workspaceId, req.params.repoId);
  });

  app.get('/repos/:repoId/context/docs/content', { schema: { params: RepoParams } }, async (req) => {
    const q = ContentQuery.safeParse(req.query);
    if (!q.success) throw badRequest('invalid_path', 'A `path` query parameter is required');
    const { workspaceId } = await getContext(app.container, req);
    return svc().readContent(workspaceId, req.params.repoId, q.data.path);
  });

  app.post('/repos/:repoId/context/reindex', { schema: { params: RepoParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    await svc().assertRepoInWorkspace(workspaceId, req.params.repoId);
    const result = await app.container.repoIntel.enqueueResync(workspaceId, req.params.repoId);
    reply.code(202);
    return result.degraded
      ? { status: 'accepted', degraded: true, reason: result.reason }
      : { status: 'accepted', jobId: result.jobId };
  });

  const registerOwner = (prefix: 'agents' | 'skills', kind: OwnerKind) => {
    app.get(`/${prefix}/:id/context`, { schema: { params: IdParams } }, async (req) => {
      const q = OwnerQuery.safeParse(req.query);
      if (!q.success) throw badRequest('invalid_request', 'A valid `repo_id` query parameter is required');
      const { workspaceId } = await getContext(app.container, req);
      return svc().getAttachments(workspaceId, kind, req.params.id, q.data.repo_id);
    });

    app.put(`/${prefix}/:id/context`, { schema: { params: IdParams } }, async (req) => {
      const body = ContextAttachmentPut.safeParse(req.body);
      if (!body.success || !z.string().uuid().safeParse(body.data.repo_id).success) {
        throw badRequest('invalid_request', 'Body must be { repo_id: uuid, paths: string[] }');
      }
      const { workspaceId } = await getContext(app.container, req);
      return svc().putAttachments(workspaceId, kind, req.params.id, body.data);
    });
  };
  registerOwner('agents', 'agent');
  registerOwner('skills', 'skill');
}
