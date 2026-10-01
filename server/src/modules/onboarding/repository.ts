import { and, eq, sql } from 'drizzle-orm';
import { Tour } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

type LastAttempt = NonNullable<Tour['last_attempt']>;

/**
 * Onboarding data-access. The ONLY layer touching the DB for the onboarding
 * module. `onboarding` has no workspace column, so reads are scoped through a
 * join on `repos.workspace_id`; callers load the repo with `getRepoForWorkspace`
 * before any write. The whole `Tour` lives in the `json` jsonb column.
 */
export class OnboardingRepository {
  /** `onInvalid` lets the caller log a stored document that no longer parses. */
  constructor(
    private db: Db,
    private onInvalid?: (repoId: string, issues: string) => void,
  ) {}

  async getRepoForWorkspace(
    workspaceId: string,
    repoId: string,
  ): Promise<typeof t.repos.$inferSelect | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** The stored tour, or null when none exists, the repo is outside the workspace, or the json is invalid. */
  async getTour(workspaceId: string, repoId: string): Promise<Tour | null> {
    const [row] = await this.db
      .select({ json: t.onboarding.json })
      .from(t.onboarding)
      .innerJoin(t.repos, eq(t.repos.id, t.onboarding.repoId))
      .where(and(eq(t.onboarding.repoId, repoId), eq(t.repos.workspaceId, workspaceId)));
    if (!row) return null;
    const parsed = Tour.safeParse(row.json);
    if (!parsed.success) {
      this.onInvalid?.(repoId, parsed.error.issues.map((i) => i.path.join('.')).join(', '));
      return null;
    }
    return parsed.data;
  }

  /** One row per repo: insert, or overwrite in place. */
  async saveTour(repoId: string, tour: Tour): Promise<void> {
    const generatedAt = new Date(tour.generated_at);
    await this.db
      .insert(t.onboarding)
      .values({ repoId, json: tour, generatedAt })
      .onConflictDoUpdate({ target: t.onboarding.repoId, set: { json: tour, generatedAt } });
  }

  /** Records a failed regenerate on the kept tour without touching anything else. No-op when no tour exists. */
  async setLastAttempt(repoId: string, lastAttempt: LastAttempt): Promise<void> {
    await this.db
      .update(t.onboarding)
      .set({
        json: sql`jsonb_set(${t.onboarding.json}, '{last_attempt}', ${JSON.stringify(lastAttempt)}::jsonb)`,
      })
      .where(eq(t.onboarding.repoId, repoId));
  }
}
