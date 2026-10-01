import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/** What the blast use case needs to know about a PR. */
export interface PullContext {
  prId: string;
  number: number;
  repoId: string;
  repoFullName: string;
  base: string;
  headSha: string;
  /** Changed file paths (`pr_files`); empty until the PR detail was opened once. */
  files: string[];
}

/** Blast data-access: the only layer that touches the DB for this module. */
export class BlastRepository {
  constructor(private db: Db) {}

  /** The PR, its repo and changed files — scoped by workspace (IDOR guard). */
  async findPullContext(workspaceId: string, prId: string): Promise<PullContext | undefined> {
    const [pull] = await this.db
      .select({
        prId: t.pullRequests.id,
        number: t.pullRequests.number,
        repoId: t.pullRequests.repoId,
        repoFullName: t.repos.fullName,
        base: t.pullRequests.base,
        headSha: t.pullRequests.headSha,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!pull) return undefined;

    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, pull.prId));
    return { ...pull, files: rows.map((r) => r.path) };
  }
}
