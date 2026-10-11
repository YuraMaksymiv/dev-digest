import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, desc, eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotificationService } from './service.js';
import { NotifyInput } from './constants.js';

export default async function notificationsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new NotificationService(app.container);

  app.get('/pulls/:id/notifications', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const rows = await app.container.db
      .select()
      .from(t.prNotifications)
      .where(
        and(
          eq(t.prNotifications.workspaceId, workspaceId),
          eq(t.prNotifications.prId, req.params.id),
        ),
      )
      .orderBy(desc(t.prNotifications.createdAt));
    return rows.map((r) => ({
      id: r.id,
      channel: r.channel,
      sent_at: r.createdAt.toISOString(),
    }));
  });

  app.post(
    '/pulls/:id/notifications',
    { schema: { params: IdParams, body: NotifyInput } },
    async (req, reply) => {
      const { workspaceId, userId } = await getContext(app.container, req);
      const result = await service.notify(workspaceId, userId, req.params.id, req.body.channel);
      reply.status(201);
      return result;
    },
  );
}
