import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { NotifyChannel } from './constants.js';

export interface PullSummary {
  id: string;
  number: number;
  title: string;
}

export interface InsertNotification {
  workspaceId: string;
  prId: string;
  channel: NotifyChannel;
  body: string;
  createdBy: string;
}

export interface SavedNotification {
  id: string;
  sentAt: string;
}

export class NotificationRepository {
  constructor(private db: Db) {}

  async getPull(workspaceId: string, prId: string): Promise<PullSummary | undefined> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id, number: t.pullRequests.number, title: t.pullRequests.title })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async insert(values: InsertNotification): Promise<SavedNotification> {
    const [row] = await this.db
      .insert(t.prNotifications)
      .values(values)
      .returning({ id: t.prNotifications.id, createdAt: t.prNotifications.createdAt });
    return { id: row!.id, sentAt: row!.createdAt.toISOString() };
  }
}
