import { and, count, desc, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import type { AgentRow, EvalCaseRow, EvalRunRow } from '../../db/rows.js';
import * as t from '../../db/schema.js';
import type { EvalCaseLastRun, EvalCaseMeta, EvalExpectation, EvalSkillRef } from '@devdigest/shared';
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

/** The columns a run list / dashboard row needs. Everything wide (`results`, `system_prompt`, `skills`, `case_ids`) stays out. */
const RUN_SUMMARY = {
  id: t.evalRuns.id,
  agentId: t.evalRuns.agentId,
  agentVersion: t.evalRuns.agentVersion,
  status: t.evalRuns.status,
  ranAt: t.evalRuns.ranAt,
  finishedAt: t.evalRuns.finishedAt,
  casesDone: t.evalRuns.casesDone,
  tracesPassed: t.evalRuns.tracesPassed,
  tracesTotal: t.evalRuns.tracesTotal,
  casesErrored: t.evalRuns.casesErrored,
  unlabeled: t.evalRuns.unlabeled,
  recall: t.evalRuns.recall,
  precision: t.evalRuns.precision,
  citationAccuracy: t.evalRuns.citationAccuracy,
  costUsd: t.evalRuns.costUsd,
  costPartial: t.evalRuns.costPartial,
  durationMs: t.evalRuns.durationMs,
  errorReason: t.evalRuns.errorReason,
} as const;

export type RunSummaryRow = Pick<EvalRunRow, keyof typeof RUN_SUMMARY>;
export type RunWithAgent = RunSummaryRow & { agentName: string };

/** The columns of a case LIST row: no `input_diff` (up to 400k chars per case) and no notes. */
const CASE_LIST = {
  id: t.evalCases.id,
  workspaceId: t.evalCases.workspaceId,
  ownerKind: t.evalCases.ownerKind,
  ownerId: t.evalCases.ownerId,
  agentId: t.evalCases.agentId,
  sourceFindingId: t.evalCases.sourceFindingId,
  name: t.evalCases.name,
  inputFiles: t.evalCases.inputFiles,
  inputMeta: t.evalCases.inputMeta,
  expectedOutput: t.evalCases.expectedOutput,
  createdAt: t.evalCases.createdAt,
} as const;

export type CaseListRow = Pick<EvalCaseRow, keyof typeof CASE_LIST>;

/** Outcome of an insert that enforces the per-agent case cap. */
export type CaseInsertResult =
  | { kind: 'created' | 'existing'; row: EvalCaseRow }
  | { kind: 'limit' };

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
   * Run `fn` in a transaction holding a per-agent advisory lock: concurrent creates for one agent are
   * serialised, so "count, then insert" cannot let the cap be overshot.
   */
  private withAgentLock<T>(agentId: string, fn: (tx: Parameters<Parameters<Db['transaction']>[0]>[0]) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${agentId}))`);
      return fn(tx);
    });
  }

  /**
   * Insert a case frozen from a finding, unless the agent is at `cap` cases. A second create for the same
   * (finding, agent) returns the existing row; the unique index backs that for any concurrent race.
   */
  async insertCase(v: InsertEvalCase, cap: number): Promise<CaseInsertResult> {
    return this.withAgentLock(v.agentId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(t.evalCases)
        .where(
          and(
            eq(t.evalCases.workspaceId, v.workspaceId),
            eq(t.evalCases.sourceFindingId, v.sourceFindingId),
            eq(t.evalCases.ownerKind, 'agent'),
            eq(t.evalCases.ownerId, v.agentId),
          ),
        );
      if (existing) return { kind: 'existing', row: existing } as const;
      if ((await this.countCasesIn(tx, v.workspaceId, v.agentId)) >= cap) return { kind: 'limit' } as const;
      const [inserted] = await tx
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
        .returning();
      return { kind: 'created', row: inserted! } as const;
    });
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

  /** Case rows for the list view: no diffs. */
  async listCaseSummaries(workspaceId: string, agentId: string): Promise<CaseListRow[]> {
    return this.db
      .select(CASE_LIST)
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

  /** Full case rows (with diffs): what a run needs. */
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
    // Only the per-case summary leaves the database: the wide `results` jsonb of the newest runs is
    // unpacked in SQL (newest result per case wins) instead of being shipped to Node and parsed.
    const rows = await this.db.execute<{
      case_id: string;
      status: EvalCaseLastRun['status'];
      findings_total: number;
      findings_matched: number;
      duration_ms: number;
      cost_usd: number | null;
    }>(sql`
      SELECT DISTINCT ON (r.value ->> 'case_id')
        r.value ->> 'case_id' AS case_id,
        r.value ->> 'status' AS status,
        jsonb_array_length(r.value -> 'produced') AS findings_total,
        (
          SELECT count(DISTINCT m.value)::int
          FROM jsonb_array_elements(r.value -> 'outcomes') o, jsonb_array_elements(o.value -> 'matched_by') m
        ) AS findings_matched,
        (r.value ->> 'duration_ms')::int AS duration_ms,
        (r.value ->> 'cost_usd')::float8 AS cost_usd
      FROM (
        SELECT results, ran_at FROM eval_runs
        WHERE workspace_id = ${workspaceId} AND agent_id = ${agentId} AND status = 'completed'
        ORDER BY ran_at DESC
        LIMIT ${LAST_RESULT_RUN_WINDOW}
      ) runs, jsonb_array_elements(runs.results) r
      ORDER BY r.value ->> 'case_id', runs.ran_at DESC
    `);
    const last = new Map<string, EvalCaseLastRun>();
    for (const r of rows) {
      last.set(r.case_id, {
        status: r.status,
        findings_total: r.findings_total,
        findings_matched: r.findings_matched,
        duration_ms: r.duration_ms,
        cost_usd: r.cost_usd,
      });
    }
    return last;
  }

  /** A hand-written case (no source finding, never deduplicated), unless the agent is at `cap` cases. */
  async insertManualCase(v: InsertManualCase, cap: number): Promise<CaseInsertResult> {
    return this.withAgentLock(v.agentId, async (tx) => {
      if ((await this.countCasesIn(tx, v.workspaceId, v.agentId)) >= cap) return { kind: 'limit' } as const;
      const [row] = await tx
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
      return { kind: 'created', row: row! } as const;
    });
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
    return this.countCasesIn(this.db, workspaceId, agentId);
  }

  private async countCasesIn(
    db: Pick<Db, 'select'>,
    workspaceId: string,
    agentId: string,
  ): Promise<number> {
    const [row] = await db
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

  /**
   * Insert the run in `running`. A second concurrent run of the agent violates the partial unique index:
   * that comes back as `{ ok: false }` so the SERVICE decides it is a 409 (no HTTP rule in the repository).
   */
  async insertRunningRun(v: InsertRunningRun): Promise<{ ok: true; run: EvalRunRow } | { ok: false; reason: 'already_running' }> {
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
      return { ok: true, run: row! };
    } catch (err) {
      if (isOneRunningViolation(err)) return { ok: false, reason: 'already_running' };
      throw err;
    }
  }

  /** Progress is just a counter: the (wide) results are written once, by `finishRun`. */
  async markProgress(runId: string, progress: { casesDone: number }): Promise<void> {
    await this.db
      .update(t.evalRuns)
      .set({ casesDone: progress.casesDone })
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
  async listRunsForAgent(workspaceId: string, agentId: string, limit: number): Promise<RunSummaryRow[]> {
    return this.db
      .select(RUN_SUMMARY)
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

  /** Newest suite runs across the workspace's agents, with the agent name (summary columns only). */
  async recentRuns(workspaceId: string, limit: number): Promise<RunWithAgent[]> {
    const rows = await this.db
      .select({ ...RUN_SUMMARY, agentName: t.agents.name })
      .from(t.evalRuns)
      .innerJoin(t.agents, eq(t.agents.id, t.evalRuns.agentId))
      .where(and(eq(t.evalRuns.workspaceId, workspaceId), isNotNull(t.evalRuns.status)))
      .orderBy(desc(t.evalRuns.ranAt), desc(t.evalRuns.id))
      .limit(limit);
    return rows;
  }

  /** The newest `perAgent` COMPLETED runs of each listed agent (a window per agent, not one global window). */
  async completedRunsForAgents(workspaceId: string, agentIds: string[], perAgent: number): Promise<RunSummaryRow[]> {
    if (agentIds.length === 0) return [];
    const rn = sql<number>`row_number() over (partition by ${t.evalRuns.agentId} order by ${t.evalRuns.ranAt} desc, ${t.evalRuns.id} desc)`.as('rn');
    const ranked = this.db
      .select({ ...RUN_SUMMARY, rn })
      .from(t.evalRuns)
      .where(
        and(
          eq(t.evalRuns.workspaceId, workspaceId),
          eq(t.evalRuns.status, 'completed'),
          inArray(t.evalRuns.agentId, agentIds),
        ),
      )
      .as('ranked');
    const rows = await this.db.select().from(ranked).where(lte(ranked.rn, perAgent));
    return rows.map(({ rn: _rn, ...run }) => run);
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
