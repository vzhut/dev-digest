import { and, count, desc, eq, isNotNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import type { AgentRow, EvalCaseRow, EvalRunRow } from '../../db/rows.js';
import * as t from '../../db/schema.js';
import type { EvalCaseLastRun, EvalCaseMeta, EvalExpectation, EvalSkillRef } from '@devdigest/shared';
import { toCaseLastRun } from './helpers.js';
import { EvalRequestError } from './errors.js';
import type { EvalRunFinish } from './ports.js';

export type { EvalCaseRow, EvalRunRow };

/** A finding with everything needed to freeze a case from it, or undefined when out of the workspace. */
export interface FindingCaseContext {
  finding: typeof t.findings.$inferSelect;
  review: { id: string; agentId: string | null; runId: string | null };
  pull: { id: string; number: number; title: string; body: string | null; headSha: string };
  repo: { owner: string; name: string };
  /** `pr_files.patch` of the finding's file (null when the file or its patch is not stored). */
  patch: string | null;
  /** Whether the producing agent still exists in this workspace. */
  agentExists: boolean;
}

export interface InsertEvalCase {
  workspaceId: string;
  agentId: string;
  sourceFindingId: string;
  name: string;
  inputDiff: string;
  inputFiles: string[];
  inputMeta: EvalCaseMeta;
  expectedOutput: EvalExpectation;
}

/** An agent plus its skill links (both enabled flags) — gating/ordering is `resolveRunSkills`. */
export interface AgentRunSnapshot {
  agent: AgentRow;
  skillLinks: {
    order: number;
    linkEnabled: boolean;
    skill: {
      id: string;
      name: string;
      body: string;
      source: string;
      enabled: boolean;
      contextPaths: string[];
      version: number;
    };
  }[];
}

export interface InsertRunningRun {
  workspaceId: string;
  agentId: string;
  agentVersion: number;
  provider: string;
  model: string;
  systemPrompt: string;
  strategy: string | null;
  skills: EvalSkillRef[];
  caseIds: string[];
}

export interface AgentWithCases {
  id: string;
  name: string;
  model: string;
  casesTotal: number;
}

export type RunWithAgent = EvalRunRow & { agentName: string };

/** The partial unique index that allows one `running` suite per agent (AC-18). */
const ONE_RUNNING_INDEX = 'eval_runs_one_running_per_agent';

function isOneRunningViolation(err: unknown): boolean {
  const e = err as { code?: string; constraint_name?: string; cause?: unknown } | null;
  if (!e) return false;
  if (e.code === '23505' && e.constraint_name === ONE_RUNNING_INDEX) return true;
  return e.cause ? isOneRunningViolation(e.cause) : false;
}

export interface InsertManualCase {
  workspaceId: string;
  agentId: string;
  name: string;
  inputDiff: string;
  inputFiles: string[];
  inputMeta: EvalCaseMeta;
  expectedOutput: EvalExpectation;
  notes: string | null;
}

export type UpdateEvalCase = Omit<InsertManualCase, 'workspaceId' | 'agentId'>;

/** How many of the newest finished runs are scanned for a case's last result. */
const LAST_RESULT_RUN_WINDOW = 20;

/**
 * Eval data-access — the only layer touching the DB for this module. Every query is scoped by
 * workspace (directly, or through the PR / agent the row hangs off); a row of another workspace
 * reads as "not found".
 */
export class EvalRepository {
  constructor(private db: Db) {}

  // ---- cases ---------------------------------------------------------------

  async findFindingContext(workspaceId: string, findingId: string): Promise<FindingCaseContext | undefined> {
    const [row] = await this.db
      .select({
        finding: t.findings,
        reviewId: t.reviews.id,
        agentId: t.reviews.agentId,
        runId: t.reviews.runId,
        pull: {
          id: t.pullRequests.id,
          number: t.pullRequests.number,
          title: t.pullRequests.title,
          body: t.pullRequests.body,
          headSha: t.pullRequests.headSha,
        },
        owner: t.repos.owner,
        name: t.repos.name,
        patch: t.prFiles.patch,
        agentRowId: t.agents.id,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .innerJoin(
        t.pullRequests,
        and(eq(t.pullRequests.id, t.reviews.prId), eq(t.pullRequests.workspaceId, workspaceId)),
      )
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .leftJoin(t.prFiles, and(eq(t.prFiles.prId, t.pullRequests.id), eq(t.prFiles.path, t.findings.file)))
      .leftJoin(t.agents, and(eq(t.agents.id, t.reviews.agentId), eq(t.agents.workspaceId, workspaceId)))
      .where(and(eq(t.findings.id, findingId), eq(t.reviews.workspaceId, workspaceId)))
      .limit(1);
    if (!row) return undefined;
    return {
      finding: row.finding,
      review: { id: row.reviewId, agentId: row.agentId, runId: row.runId },
      pull: row.pull,
      repo: { owner: row.owner, name: row.name },
      patch: row.patch,
      agentExists: row.agentRowId !== null,
    };
  }

  async findCaseBySource(workspaceId: string, findingId: string, agentId: string): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.sourceFindingId, findingId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agentId),
        ),
      );
    return row;
  }

  /**
   * Insert a case; the unique (source finding, owner) index makes a concurrent duplicate a no-op,
   * in which case the existing row is returned with `created: false`.
   */
  async insertCase(v: InsertEvalCase): Promise<{ row: EvalCaseRow; created: boolean }> {
    const [inserted] = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: v.workspaceId,
        ownerKind: 'agent',
        ownerId: v.agentId,
        agentId: v.agentId,
        sourceFindingId: v.sourceFindingId,
        name: v.name,
        inputDiff: v.inputDiff,
        inputFiles: v.inputFiles,
        inputMeta: v.inputMeta,
        expectedOutput: v.expectedOutput,
      })
      .onConflictDoNothing({ target: [t.evalCases.sourceFindingId, t.evalCases.ownerKind, t.evalCases.ownerId] })
      .returning();
    if (inserted) return { row: inserted, created: true };
    const existing = await this.findCaseBySource(v.workspaceId, v.sourceFindingId, v.agentId);
    if (!existing) throw new Error('eval case insert conflicted but no existing row was found');
    return { row: existing, created: false };
  }

  async agentExists(workspaceId: string, agentId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.id, agentId), eq(t.agents.workspaceId, workspaceId)));
    return Boolean(row);
  }

  async pullExists(workspaceId: string, prId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.id, prId), eq(t.pullRequests.workspaceId, workspaceId)));
    return Boolean(row);
  }

  async listCasesForAgent(workspaceId: string, agentId: string): Promise<EvalCaseRow[]> {
    return this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agentId),
        ),
      )
      .orderBy(desc(t.evalCases.createdAt), desc(t.evalCases.id));
  }

  /**
   * Last run per case: the newest finished run (of the last LAST_RESULT_RUN_WINDOW) that holds a
   * result for it, so a subset run only refreshes the cases it covered. A case no scanned run
   * mentions is simply absent from the map (= never run).
   */
  async lastResultsForAgent(workspaceId: string, agentId: string): Promise<Map<string, EvalCaseLastRun>> {
    const runs = await this.db
      .select({ results: t.evalRuns.results })
      .from(t.evalRuns)
      .where(
        and(
          eq(t.evalRuns.workspaceId, workspaceId),
          eq(t.evalRuns.agentId, agentId),
          eq(t.evalRuns.status, 'completed'),
        ),
      )
      .orderBy(desc(t.evalRuns.ranAt))
      .limit(LAST_RESULT_RUN_WINDOW);
    const last = new Map<string, EvalCaseLastRun>();
    for (const run of runs) {
      for (const r of run.results ?? []) if (!last.has(r.case_id)) last.set(r.case_id, toCaseLastRun(r));
    }
    return last;
  }

  /** A hand-written case: no source finding, so it is never deduplicated. */
  async insertManualCase(v: InsertManualCase): Promise<EvalCaseRow> {
    const [row] = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: v.workspaceId,
        ownerKind: 'agent',
        ownerId: v.agentId,
        agentId: v.agentId,
        sourceFindingId: null,
        name: v.name,
        inputDiff: v.inputDiff,
        inputFiles: v.inputFiles,
        inputMeta: v.inputMeta,
        expectedOutput: v.expectedOutput,
        notes: v.notes,
      })
      .returning();
    return row!;
  }

  /** Update the editable parts of a case; stored run results are untouched. Undefined when not in the workspace. */
  async updateCase(workspaceId: string, caseId: string, v: UpdateEvalCase): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .update(t.evalCases)
      .set({
        name: v.name,
        inputDiff: v.inputDiff,
        inputFiles: v.inputFiles,
        inputMeta: v.inputMeta,
        expectedOutput: v.expectedOutput,
        notes: v.notes,
      })
      .where(and(eq(t.evalCases.id, caseId), eq(t.evalCases.workspaceId, workspaceId)))
      .returning();
    return row;
  }

  async getCase(workspaceId: string, caseId: string): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.id, caseId), eq(t.evalCases.workspaceId, workspaceId)));
    return row;
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.id, caseId), eq(t.evalCases.workspaceId, workspaceId)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  /** Findings of this PR that already have an agent-owned case (FindingCard tag, AC-10). */
  async caseLinksForPull(
    workspaceId: string,
    prId: string,
  ): Promise<{ findingId: string; caseId: string; expectation: EvalExpectation | null }[]> {
    const rows = await this.db
      .select({
        findingId: t.findings.id,
        caseId: t.evalCases.id,
        expectation: t.evalCases.expectedOutput,
      })
      .from(t.evalCases)
      .innerJoin(t.findings, eq(t.findings.id, t.evalCases.sourceFindingId))
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.reviews.prId, prId),
          eq(t.reviews.workspaceId, workspaceId),
        ),
      );
    return rows;
  }

  // ---- runs ----------------------------------------------------------------

  /** The agent with its skill links, or undefined when it is not in this workspace. */
  async agentSnapshot(workspaceId: string, agentId: string): Promise<AgentRunSnapshot | undefined> {
    const [agent] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.id, agentId), eq(t.agents.workspaceId, workspaceId)));
    if (!agent) return undefined;
    const skillLinks = await this.db
      .select({
        order: t.agentSkills.order,
        linkEnabled: t.agentSkills.enabled,
        skill: {
          id: t.skills.id,
          name: t.skills.name,
          body: t.skills.body,
          source: t.skills.source,
          enabled: t.skills.enabled,
          contextPaths: t.skills.contextPaths,
          version: t.skills.version,
        },
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId));
    return { agent, skillLinks };
  }

  async countCases(workspaceId: string, agentId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agentId),
        ),
      );
    return row?.n ?? 0;
  }

  /** Insert the run in `running`; a second concurrent run of the agent is `409 eval_run_in_progress`. */
  async insertRunningRun(v: InsertRunningRun): Promise<EvalRunRow> {
    try {
      const [row] = await this.db
        .insert(t.evalRuns)
        .values({
          workspaceId: v.workspaceId,
          agentId: v.agentId,
          agentVersion: v.agentVersion,
          provider: v.provider,
          model: v.model,
          systemPrompt: v.systemPrompt,
          strategy: v.strategy,
          skills: v.skills,
          caseIds: v.caseIds,
          status: 'running',
          tracesTotal: v.caseIds.length,
          results: [],
        })
        .returning();
      return row!;
    } catch (err) {
      if (isOneRunningViolation(err)) {
        throw new EvalRequestError('eval_run_in_progress', 'An eval run for this agent is already running', 409);
      }
      throw err;
    }
  }

  async markProgress(runId: string, progress: { casesDone: number; results: EvalRunRow['results'] }): Promise<void> {
    await this.db
      .update(t.evalRuns)
      .set({ casesDone: progress.casesDone, results: progress.results })
      .where(eq(t.evalRuns.id, runId));
  }

  async finishRun(runId: string, f: EvalRunFinish): Promise<void> {
    await this.db
      .update(t.evalRuns)
      .set({
        status: f.status,
        casesDone: f.results.length,
        casesErrored: f.score.cases_errored,
        unlabeled: f.score.unlabeled,
        tracesPassed: f.score.traces_passed,
        tracesTotal: f.score.traces_total,
        recall: f.score.recall,
        precision: f.score.precision,
        citationAccuracy: f.score.citation_accuracy,
        costUsd: f.score.cost_usd,
        costPartial: f.score.cost_partial,
        results: f.results,
        durationMs: f.durationMs,
        errorReason: f.errorReason ?? null,
        finishedAt: new Date(),
      })
      .where(eq(t.evalRuns.id, runId));
  }

  /** A run-level failure (the loop itself blew up): terminal `errored` with a reason. */
  async failRun(runId: string, reason: string): Promise<void> {
    await this.db
      .update(t.evalRuns)
      .set({ status: 'errored', errorReason: reason, finishedAt: new Date() })
      .where(and(eq(t.evalRuns.id, runId), eq(t.evalRuns.status, 'running')));
  }

  /** Runs left `running` by a process that died: mark them errored so the agent is not blocked forever. */
  async failOrphanedRunning(reason: string): Promise<number> {
    const rows = await this.db
      .update(t.evalRuns)
      .set({ status: 'errored', errorReason: reason, finishedAt: new Date() })
      .where(eq(t.evalRuns.status, 'running'))
      .returning({ id: t.evalRuns.id });
    return rows.length;
  }

  /** Suite-level runs of an agent, newest first (legacy per-case rows have no status and are skipped). */
  async listRunsForAgent(workspaceId: string, agentId: string, limit: number): Promise<EvalRunRow[]> {
    return this.db
      .select()
      .from(t.evalRuns)
      .where(
        and(eq(t.evalRuns.workspaceId, workspaceId), eq(t.evalRuns.agentId, agentId), isNotNull(t.evalRuns.status)),
      )
      .orderBy(desc(t.evalRuns.ranAt), desc(t.evalRuns.id))
      .limit(limit);
  }

  async getRun(workspaceId: string, runId: string): Promise<EvalRunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalRuns)
      .where(
        and(eq(t.evalRuns.id, runId), eq(t.evalRuns.workspaceId, workspaceId), isNotNull(t.evalRuns.status)),
      );
    return row;
  }

  /** Newest suite runs across the workspace's agents, with the agent name. */
  async recentRuns(workspaceId: string, limit: number): Promise<RunWithAgent[]> {
    const rows = await this.db
      .select({ run: t.evalRuns, agentName: t.agents.name })
      .from(t.evalRuns)
      .innerJoin(t.agents, eq(t.agents.id, t.evalRuns.agentId))
      .where(and(eq(t.evalRuns.workspaceId, workspaceId), isNotNull(t.evalRuns.status)))
      .orderBy(desc(t.evalRuns.ranAt), desc(t.evalRuns.id))
      .limit(limit);
    return rows.map((r) => ({ ...r.run, agentName: r.agentName }));
  }

  /** Agents that own at least one agent-case, with their case count. */
  async agentsWithCases(workspaceId: string): Promise<AgentWithCases[]> {
    const rows = await this.db
      .select({ id: t.agents.id, name: t.agents.name, model: t.agents.model, casesTotal: count(t.evalCases.id) })
      .from(t.evalCases)
      .innerJoin(t.agents, eq(t.agents.id, t.evalCases.agentId))
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, 'agent')))
      .groupBy(t.agents.id, t.agents.name, t.agents.model)
      .orderBy(t.agents.name);
    return rows;
  }
}
