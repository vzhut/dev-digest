import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { UsedByAgent, UsedByLink, UsedBySkill } from '../_shared/project-context.js';

export interface RepoContextRow {
  id: string;
  clonePath: string | null;
  contextRoots: string[] | null;
}

export interface InheritedSkillRow {
  skillId: string;
  skillName: string;
  contextPaths: string[];
}

/** project-context data access: the only layer touching the DB. Every query is workspace-scoped. */
export class ProjectContextRepository {
  constructor(private db: Db) {}

  async findRepo(workspaceId: string, repoId: string): Promise<RepoContextRow | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, clonePath: t.repos.clonePath, contextRoots: t.repos.contextRoots })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** `null` clears the override (default glob). Writes only this column. */
  async setRoots(workspaceId: string, repoId: string, roots: string[] | null): Promise<void> {
    await this.db
      .update(t.repos)
      .set({ contextRoots: roots })
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
  }

  /** Inputs for the "used by N agents" count over the whole workspace. */
  async usedByInputs(
    workspaceId: string,
  ): Promise<{ agents: UsedByAgent[]; skills: UsedBySkill[]; links: UsedByLink[] }> {
    const [agents, skills, links] = await Promise.all([
      this.db
        .select({ id: t.agents.id, contextPaths: t.agents.contextPaths })
        .from(t.agents)
        .where(eq(t.agents.workspaceId, workspaceId)),
      this.db
        .select({ id: t.skills.id, enabled: t.skills.enabled, contextPaths: t.skills.contextPaths })
        .from(t.skills)
        .where(eq(t.skills.workspaceId, workspaceId)),
      this.db
        .select({
          agentId: t.agentSkills.agentId,
          skillId: t.agentSkills.skillId,
          enabled: t.agentSkills.enabled,
        })
        .from(t.agentSkills)
        .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
        .where(eq(t.agents.workspaceId, workspaceId)),
    ]);
    return { agents, skills, links };
  }

  async findAgentPaths(workspaceId: string, agentId: string): Promise<string[] | undefined> {
    const [row] = await this.db
      .select({ contextPaths: t.agents.contextPaths })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
    return row?.contextPaths;
  }

  /** Writes only `context_paths`: no version bump, no snapshot. */
  async setAgentPaths(workspaceId: string, agentId: string, paths: string[]): Promise<void> {
    await this.db
      .update(t.agents)
      .set({ contextPaths: paths })
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
  }

  /** Skills the agent inherits docs from: link AND skill enabled, in link order. */
  async inheritedSkills(workspaceId: string, agentId: string): Promise<InheritedSkillRow[]> {
    return this.db
      .select({
        skillId: t.skills.id,
        skillName: t.skills.name,
        contextPaths: t.skills.contextPaths,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .where(
        and(
          eq(t.agentSkills.agentId, agentId),
          eq(t.agentSkills.enabled, true),
          eq(t.skills.enabled, true),
          eq(t.skills.workspaceId, workspaceId),
        ),
      )
      .orderBy(asc(t.agentSkills.order));
  }

  async findSkillPaths(workspaceId: string, skillId: string): Promise<string[] | undefined> {
    const [row] = await this.db
      .select({ contextPaths: t.skills.contextPaths })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)));
    return row?.contextPaths;
  }

  /** Writes only `context_paths`: no version bump, no snapshot. */
  async setSkillPaths(workspaceId: string, skillId: string, paths: string[]): Promise<void> {
    await this.db
      .update(t.skills)
      .set({ contextPaths: paths })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)));
  }
}
