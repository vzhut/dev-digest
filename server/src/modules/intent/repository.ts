import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PrIntentRow, PullRow } from '../../db/rows.js';

/** Everything an upsert writes; `pr_id`, `created_at` and `updated_at` are managed here. */
export type PrIntentValues = Omit<typeof t.prIntent.$inferInsert, 'prId' | 'createdAt' | 'updatedAt'>;

/**
 * Intent data-access. The ONLY layer touching the DB for the intent module.
 * `pr_intent` has no workspace column, so reads are scoped through a join on
 * `pull_requests.workspace_id`; callers load the PR with `getPullForWorkspace`
 * before any write.
 */
export class IntentRepository {
  constructor(private db: Db) {}

  async getPullForWorkspace(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async getRepo(repoId: string): Promise<typeof t.repos.$inferSelect | undefined> {
    const [row] = await this.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    return row;
  }

  getPrFiles(prId: string): Promise<(typeof t.prFiles.$inferSelect)[]> {
    return this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
  }

  /** The latest intent for a PR, or undefined when never derived / PR not in the workspace. */
  async getIntent(workspaceId: string, prId: string): Promise<PrIntentRow | undefined> {
    const [row] = await this.db
      .select({ intent: t.prIntent })
      .from(t.prIntent)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prIntent.prId))
      .where(and(eq(t.prIntent.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)));
    return row?.intent;
  }

  /** One row per PR: insert, or overwrite in place (`created_at` kept, `updated_at` bumped). */
  async upsertIntent(prId: string, values: PrIntentValues): Promise<PrIntentRow> {
    const [row] = await this.db
      .insert(t.prIntent)
      .values({ prId, ...values })
      .onConflictDoUpdate({ target: t.prIntent.prId, set: { ...values, updatedAt: sql`now()` } })
      .returning();
    return row!;
  }
}
