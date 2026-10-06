import { eq } from 'drizzle-orm';
import { PrBrief } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * brief data-access. Owns the `pr_brief` table. Stored JSON is untrusted on
 * the way out: a row that does not parse as the current `PrBrief` is treated
 * as "no brief".
 */
export class BriefRepository {
  constructor(private db: Db) {}

  async get(prId: string): Promise<PrBrief | null> {
    const [row] = await this.db
      .select({ json: t.prBrief.json })
      .from(t.prBrief)
      .where(eq(t.prBrief.prId, prId));
    if (!row) return null;
    const parsed = PrBrief.safeParse(row.json);
    return parsed.success ? parsed.data : null;
  }

  async upsert(prId: string, brief: PrBrief): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: brief })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: brief } });
  }
}
