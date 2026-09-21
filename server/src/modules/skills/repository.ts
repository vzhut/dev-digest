import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';

/**
 * Skills data-access. Owns `skills` + `skill_versions`; reads `agent_skills`,
 * `agents`, `run_skills`, `agent_runs`, `reviews`, `findings` for stats.
 * Workspace-scoped on every query (skill_versions/run_skills via their skill).
 */

export type SkillRow = typeof t.skills.$inferSelect;
export type SkillVersionRow = typeof t.skillVersions.$inferSelect;

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled: boolean;
}

export interface SkillPatch {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  versionMessage?: string;
}

export interface SkillStatsRaw {
  agents: { id: string; name: string; enabled: boolean }[];
  runs: number;
  findings: number;
  accepted: number;
  dismissed: number;
  byCategory: { category: string; count: number }[];
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  async getByName(workspaceId: string, name: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, name)));
    return row;
  }

  async insert(input: InsertSkill): Promise<SkillRow> {
    const [row] = await this.db
      .insert(t.skills)
      .values({ ...input, version: 1 })
      .returning();
    return row!;
  }

  /**
   * Apply a patch. When `snapshotBody` is set (body changed) the PREVIOUS body is
   * written to skill_versions at the current version and `version` is bumped —
   * atomically. Returns undefined if the skill isn't in the workspace.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: SkillPatch,
    snapshotBody: boolean,
  ): Promise<SkillRow | undefined> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .for('update');
      if (!current) return undefined;
      const values: Partial<typeof t.skills.$inferInsert> = { ...patch };
      if (snapshotBody) {
        await tx.insert(t.skillVersions).values({
          skillId: id,
          version: current.version,
          body: current.body,
          message: current.versionMessage,
        });
        values.version = current.version + 1;
      }
      if (Object.keys(values).length === 0) return current;
      const [row] = await tx
        .update(t.skills)
        .set(values)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();
      return row;
    });
  }

  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** Version history, newest first (snapshots of previous bodies). */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select({
        skillId: t.skillVersions.skillId,
        version: t.skillVersions.version,
        body: t.skillVersions.body,
        message: t.skillVersions.message,
        createdAt: t.skillVersions.createdAt,
      })
      .from(t.skillVersions)
      .innerJoin(t.skills, eq(t.skills.id, t.skillVersions.skillId))
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skillVersions.skillId, skillId)))
      .orderBy(desc(t.skillVersions.version));
  }

  async getVersion(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select({
        skillId: t.skillVersions.skillId,
        version: t.skillVersions.version,
        body: t.skillVersions.body,
        message: t.skillVersions.message,
        createdAt: t.skillVersions.createdAt,
      })
      .from(t.skillVersions)
      .innerJoin(t.skills, eq(t.skills.id, t.skillVersions.skillId))
      .where(
        and(
          eq(t.skills.workspaceId, workspaceId),
          eq(t.skillVersions.skillId, skillId),
          eq(t.skillVersions.version, version),
        ),
      );
    return row;
  }

  /** Raw stats aggregates over run_skills ⋈ agent_runs ⋈ reviews ⋈ findings since `since`. */
  async statsRaw(workspaceId: string, skillId: string, since: Date): Promise<SkillStatsRaw> {
    const agents = await this.db
      .select({ id: t.agents.id, name: t.agents.name, enabled: t.agentSkills.enabled })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agentSkills.skillId, skillId)))
      .orderBy(asc(t.agents.name));

    const runScope = and(
      eq(t.runSkills.skillId, skillId),
      eq(t.agentRuns.workspaceId, workspaceId),
      gte(t.agentRuns.ranAt, since),
    );

    const [runRow] = await this.db
      .select({ runs: sql<number>`count(*)::int` })
      .from(t.runSkills)
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.runSkills.runId))
      .where(runScope);

    const [fRow] = await this.db
      .select({
        findings: sql<number>`count(${t.findings.id})::int`,
        accepted: sql<number>`count(${t.findings.acceptedAt})::int`,
        dismissed: sql<number>`count(${t.findings.dismissedAt})::int`,
      })
      .from(t.runSkills)
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.runSkills.runId))
      .innerJoin(t.reviews, eq(t.reviews.runId, t.agentRuns.id))
      .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(runScope);

    const byCategory = await this.db
      .select({
        category: t.findings.category,
        count: sql<number>`count(*)::int`,
      })
      .from(t.runSkills)
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.runSkills.runId))
      .innerJoin(t.reviews, eq(t.reviews.runId, t.agentRuns.id))
      .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(runScope)
      .groupBy(t.findings.category)
      .orderBy(desc(sql`count(*)`), asc(t.findings.category));

    return {
      agents,
      runs: runRow?.runs ?? 0,
      findings: fRow?.findings ?? 0,
      accepted: fRow?.accepted ?? 0,
      dismissed: fRow?.dismissed ?? 0,
      byCategory,
    };
  }
}
