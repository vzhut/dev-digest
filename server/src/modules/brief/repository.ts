import { and, asc, eq } from 'drizzle-orm';
import { PrBrief } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import type { PullRow } from '../../db/rows.js';
import * as t from '../../db/schema.js';
import { resolveRunDocSet } from '../_shared/project-context.js';

export interface BriefPullContext {
  pull: PullRow;
  repo: { owner: string; name: string; clonePath: string | null };
}

export interface BriefFileRow {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

/**
 * PR brief data-access: the only layer touching the DB for this module. Every
 * read is scoped by workspace (via the PR row); the whole brief is the `json`
 * jsonb column of `pr_brief`.
 */
export class BriefRepository {
  /** `onInvalid` lets the caller log a stored document that no longer parses. */
  constructor(
    private db: Db,
    private onInvalid?: (prId: string, issues: string) => void,
  ) {}

  /** The PR and its repo, or undefined when the PR is missing or in another workspace. */
  async findPull(workspaceId: string, prId: string): Promise<BriefPullContext | undefined> {
    const [row] = await this.db
      .select({
        pull: t.pullRequests,
        owner: t.repos.owner,
        name: t.repos.name,
        clonePath: t.repos.clonePath,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.id, prId), eq(t.pullRequests.workspaceId, workspaceId)));
    if (!row) return undefined;
    return { pull: row.pull, repo: { owner: row.owner, name: row.name, clonePath: row.clonePath } };
  }

  async getFiles(prId: string): Promise<BriefFileRow[]> {
    return this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
        patch: t.prFiles.patch,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .orderBy(asc(t.prFiles.path));
  }

  /** The stored brief, or null when none exists, the PR is outside the workspace, or the json no longer parses. */
  async getBrief(workspaceId: string, prId: string): Promise<PrBrief | null> {
    const [row] = await this.db
      .select({ json: t.prBrief.json })
      .from(t.prBrief)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prBrief.prId))
      .where(and(eq(t.prBrief.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)));
    if (!row) return null;
    const parsed = PrBrief.safeParse(row.json);
    if (!parsed.success) {
      this.onInvalid?.(prId, parsed.error.issues.map((i) => i.path.join('.')).join(', '));
      return null;
    }
    return parsed.data;
  }

  /** One row per PR: insert, or overwrite in place. Callers have already loaded the PR for the workspace. */
  async saveBrief(prId: string, brief: PrBrief): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: brief })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: brief } });
  }

  /**
   * Repo-relative project docs of the workspace's agents (D3): enabled agents by
   * `created_at, id`; per agent the `resolveRunDocSet` order (agent paths, then
   * skills whose link AND skill are enabled, by `agent_skills.order`, skill id).
   * First occurrence across agents wins.
   */
  async attachedDocPaths(workspaceId: string): Promise<string[]> {
    const agents = await this.db
      .select({ id: t.agents.id, contextPaths: t.agents.contextPaths })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)))
      .orderBy(asc(t.agents.createdAt), asc(t.agents.id));
    if (agents.length === 0) return [];

    const links = await this.db
      .select({ agentId: t.agentSkills.agentId, contextPaths: t.skills.contextPaths })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .where(
        and(eq(t.agentSkills.enabled, true), eq(t.skills.enabled, true), eq(t.skills.workspaceId, workspaceId)),
      )
      .orderBy(asc(t.agentSkills.order), asc(t.skills.id));

    const seen = new Set<string>();
    const out: string[] = [];
    for (const a of agents) {
      const skills = links.filter((l) => l.agentId === a.id);
      for (const p of resolveRunDocSet(a.contextPaths ?? [], skills)) {
        if (seen.has(p)) continue;
        seen.add(p);
        out.push(p);
      }
    }
    return out;
  }
}
