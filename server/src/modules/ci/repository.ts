import { and, desc, eq, ne, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiInstallationRow, RepoRow } from '../../db/rows.js';
import { CI_RUNS_LIMIT } from './constants.js';
import type { CiRunRecord, CiRunRow } from './ingest.js';

/** Data access for the ci module: `ci_installations` plus read-only lookups of `repos`/`agents`. */

export interface InstallationWithRepoId {
  row: CiInstallationRow;
  repoId: string | null;
}

/** An installation with the agent name, for the sync loop. */
export interface WorkspaceInstallation {
  id: string;
  agentId: string;
  agentName: string;
  repo: string;
}

export interface UpsertInstallation {
  agentId: string;
  repo: string;
  manifestVersion: number;
  workflowVersion: number;
  prUrl: string | null;
  status: 'pending' | 'active';
}

export class CiRepository {
  constructor(private db: Db) {}

  async getRepoForWorkspace(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** Installations of one agent (workspace-scoped through the agent), newest first. */
  async listInstallations(workspaceId: string, agentId: string): Promise<InstallationWithRepoId[]> {
    const rows = await this.db
      .select({ row: t.ciInstallations, repoId: t.repos.id })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .leftJoin(
        t.repos,
        and(eq(t.repos.fullName, t.ciInstallations.repo), eq(t.repos.workspaceId, t.agents.workspaceId)),
      )
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.ciInstallations.agentId, agentId)))
      .orderBy(desc(t.ciInstallations.installedAt));
    return rows;
  }

  /** Insert or update the (agent, repo) installation. */
  async upsertInstallation(values: UpsertInstallation): Promise<CiInstallationRow> {
    const [row] = await this.db
      .insert(t.ciInstallations)
      .values({ ...values, targetType: 'gha' })
      .onConflictDoUpdate({
        target: [t.ciInstallations.agentId, t.ciInstallations.repo],
        set: {
          manifestVersion: values.manifestVersion,
          workflowVersion: values.workflowVersion,
          prUrl: values.prUrl,
          status: values.status,
          installedAt: new Date(),
        },
      })
      .returning();
    return row!;
  }

  /** Name of another agent of the workspace that is installed in `repo`, if any. */
  async otherAgentInstalled(
    workspaceId: string,
    repo: string,
    agentId: string,
  ): Promise<string | null> {
    const [row] = await this.db
      .select({ name: t.agents.name })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.ciInstallations.repo, repo),
          ne(t.ciInstallations.agentId, agentId),
        ),
      )
      .limit(1);
    return row?.name ?? null;
  }

  /** Every installation of the workspace's agents (target `gha`). */
  async listWorkspaceInstallations(workspaceId: string): Promise<WorkspaceInstallation[]> {
    return this.db
      .select({
        id: t.ciInstallations.id,
        agentId: t.ciInstallations.agentId,
        agentName: t.agents.name,
        repo: t.ciInstallations.repo,
      })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.ciInstallations.targetType, 'gha')));
  }

  /** True when a CI run with this key (`<run.id>:<run_attempt>`) is already stored. */
  async hasCiRunKey(workspaceId: string, key: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.agentRuns.id })
      .from(t.agentRuns)
      .innerJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.source, 'ci'),
          sql`${t.runTraces.trace}->>'ci_run_key' = ${key}`,
        ),
      )
      .limit(1);
    return !!row;
  }

  /**
   * Store one CI run: `agent_runs` + `run_traces` in ONE transaction (the local
   * executor writes them apart; here a half-written run would never be retried).
   * `pr_id` stays null: a CI run is not tied to an imported PR.
   */
  async insertCiRun(record: CiRunRecord): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [run] = await tx
        .insert(t.agentRuns)
        .values({ ...record.run, prId: null, source: 'ci' })
        .returning({ id: t.agentRuns.id });
      await tx.insert(t.runTraces).values({ runId: run!.id, trace: record.trace });
    });
  }

  async markInstallationActive(installationId: string): Promise<void> {
    await this.db
      .update(t.ciInstallations)
      .set({ status: 'active' })
      .where(eq(t.ciInstallations.id, installationId));
  }

  /** CI runs of the workspace, newest first. */
  async listCiRuns(workspaceId: string): Promise<CiRunRow[]> {
    return this.db
      .select({
        id: t.agentRuns.id,
        agentId: t.agentRuns.agentId,
        ranAt: t.agentRuns.ranAt,
        status: t.agentRuns.status,
        blockers: t.agentRuns.blockers,
        findingsCount: t.agentRuns.findingsCount,
        costUsd: t.agentRuns.costUsd,
        durationMs: t.agentRuns.durationMs,
        trace: t.runTraces.trace,
      })
      .from(t.agentRuns)
      .innerJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
      .where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.source, 'ci')))
      .orderBy(desc(t.agentRuns.ranAt))
      .limit(CI_RUNS_LIMIT);
  }
}
