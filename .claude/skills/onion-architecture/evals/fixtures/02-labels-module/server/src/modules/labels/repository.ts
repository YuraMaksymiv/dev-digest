import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type LabelRow = typeof t.prLabels.$inferSelect;
export type PullRow = typeof t.pullRequests.$inferSelect;

export interface InsertLabel {
  workspaceId: string;
  prId: string;
  name: string;
  createdBy: string;
}

export class LabelRepository {
  constructor(private db: Db) {}

  async findPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async listForPull(workspaceId: string, prId: string): Promise<LabelRow[]> {
    return this.db
      .select()
      .from(t.prLabels)
      .where(and(eq(t.prLabels.workspaceId, workspaceId), eq(t.prLabels.prId, prId)));
  }

  async deleteForPull(workspaceId: string, prId: string): Promise<void> {
    await this.db
      .delete(t.prLabels)
      .where(and(eq(t.prLabels.workspaceId, workspaceId), eq(t.prLabels.prId, prId)));
  }

  async insertMany(values: InsertLabel[]): Promise<void> {
    if (values.length === 0) return;
    await this.db.insert(t.prLabels).values(values);
  }

  async touchPull(prId: string): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({ updatedAt: new Date() })
      .where(eq(t.pullRequests.id, prId));
  }
}
