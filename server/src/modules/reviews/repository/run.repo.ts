import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { RunSummary, RunTrace } from '@devdigest/shared';
import type { FindingRow } from '../../../db/rows.js';
import { findingPreviewsByReview } from '../../_shared/finding-previews.js';

// ---- in-flight / history --------------------------------------------------

/** In-flight runs for a PR (status='running') — the server-side source of
 *  truth for "which agents are running now". Joined with the agent name. */
export async function activeRunsForPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<{ run_id: string; agent_id: string | null; agent_name: string | null; ran_at: string | null }[]> {
  const rows = await db
    .select({
      id: t.agentRuns.id,
      agentId: t.agentRuns.agentId,
      ranAt: t.agentRuns.ranAt,
      agentName: t.agents.name,
    })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(
      and(
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.agentRuns.prId, prId),
        eq(t.agentRuns.status, 'running'),
      ),
    );
  return rows.map((r) => ({
    run_id: r.id,
    agent_id: r.agentId,
    agent_name: r.agentName ?? null,
    ran_at: r.ranAt ? r.ranAt.toISOString() : null,
  }));
}

/** All runs for a PR (any status), newest first — the PR run history. */
export async function listRunsForPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<RunSummary[]> {
  const rows = await db
    .select({ run: t.agentRuns, agentName: t.agents.name })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.prId, prId)))
    .orderBy(desc(t.agentRuns.ranAt));

  // Each run's review (reviews.run_id — no FK) and its finding previews for
  // the timeline popover: two batched queries regardless of run count.
  const runIds = rows.map(({ run }) => run.id);
  const reviewIdByRun = new Map<string, string>();
  if (runIds.length > 0) {
    const reviewRows = await db
      .select({ id: t.reviews.id, runId: t.reviews.runId })
      .from(t.reviews)
      .where(and(eq(t.reviews.workspaceId, workspaceId), inArray(t.reviews.runId, runIds)));
    for (const rv of reviewRows) if (rv.runId) reviewIdByRun.set(rv.runId, rv.id);
  }
  const findingsByReview = await findingPreviewsByReview(db, [...reviewIdByRun.values()]);

  return rows.map(({ run, agentName }) => ({
    run_id: run.id,
    agent_id: run.agentId,
    agent_name: agentName ?? null,
    provider: run.provider,
    model: run.model,
    status: run.status,
    error: run.error,
    duration_ms: run.durationMs,
    tokens_in: run.tokensIn,
    tokens_out: run.tokensOut,
    cost_usd: run.costUsd,
    findings_count: run.findingsCount,
    grounding: run.grounding,
    ran_at: run.ranAt ? run.ranAt.toISOString() : null,
    score: run.score,
    blockers: run.blockers,
    findings: reviewIdByRun.has(run.id)
      ? (findingsByReview.get(reviewIdByRun.get(run.id)!) ?? [])
      : null,
  }));
}

/**
 * Delete one agent run (+ its trace via FK cascade) AND the review it produced.
 * Workspace-scoped. `reviews.run_id` has no FK to `agent_runs`, so the review
 * (and its findings, which DO cascade from `reviews`) must be removed explicitly
 * here — otherwise deleting a run from the timeline leaves its findings orphaned
 * in the Review Runs list below.
 */
export async function deleteAgentRun(
  db: Db,
  workspaceId: string,
  runId: string,
): Promise<boolean> {
  await db
    .delete(t.reviews)
    .where(and(eq(t.reviews.runId, runId), eq(t.reviews.workspaceId, workspaceId)));
  const rows = await db
    .delete(t.agentRuns)
    .where(and(eq(t.agentRuns.id, runId), eq(t.agentRuns.workspaceId, workspaceId)))
    .returning({ id: t.agentRuns.id });
  return rows.length > 0;
}

/** Mark a still-running run as cancelled (no-op if it already finished). */
export async function cancelRunIfRunning(db: Db, runId: string): Promise<boolean> {
  const rows = await db
    .update(t.agentRuns)
    .set({ status: 'cancelled' })
    .where(and(eq(t.agentRuns.id, runId), eq(t.agentRuns.status, 'running')))
    .returning({ id: t.agentRuns.id });
  return rows.length > 0;
}

/** On boot: any run still 'running' is orphaned (its process died / restarted),
 *  so mark it failed. Prevents permanently stuck "running" runs in the UI. */
export async function reapStaleRunningRuns(db: Db): Promise<number> {
  const rows = await db
    .update(t.agentRuns)
    .set({ status: 'failed' })
    .where(eq(t.agentRuns.status, 'running'))
    .returning({ id: t.agentRuns.id });
  return rows.length;
}

/** Insert the parent row of a multi-agent review; returns its id. */
export async function createMultiAgentRun(
  db: Db,
  values: { workspaceId: string; prId: string },
): Promise<string> {
  const [row] = await db
    .insert(t.multiAgentRuns)
    .values({ workspaceId: values.workspaceId, prId: values.prId })
    .returning({ id: t.multiAgentRuns.id });
  return row!.id;
}

export type MultiAgentRunData = {
  parent: { id: string; prId: string; prNumber: number | null; prTitle: string | null; ranAt: Date; durationMs: number | null };
  runs: {
    run: typeof t.agentRuns.$inferSelect;
    currentAgentName: string | null;
    review: { verdict: string | null; summary: string | null; score: number | null } | null;
    findings: FindingRow[];
  }[];
};

/** Id of the repo's most recent parent run (workspace-scoped), if any. */
export async function latestMultiAgentRunId(
  db: Db,
  workspaceId: string,
  repoId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: t.multiAgentRuns.id })
    .from(t.multiAgentRuns)
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
    .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.pullRequests.repoId, repoId)))
    .orderBy(desc(t.multiAgentRuns.ranAt))
    .limit(1);
  return row?.id ?? null;
}

/** Id of a PR's most recent parent run (workspace-scoped), if any. */
export async function latestMultiAgentRunIdForPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: t.multiAgentRuns.id })
    .from(t.multiAgentRuns)
    .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.prId, prId)))
    .orderBy(desc(t.multiAgentRuns.ranAt))
    .limit(1);
  return row?.id ?? null;
}

/** Parent run + children (creation order) + each child's review and findings. Workspace-scoped. */
export async function getMultiAgentRunData(
  db: Db,
  workspaceId: string,
  id: string,
): Promise<MultiAgentRunData | undefined> {
  const [parentRow] = await db
    .select({ run: t.multiAgentRuns, prNumber: t.pullRequests.number, prTitle: t.pullRequests.title })
    .from(t.multiAgentRuns)
    .leftJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
    .where(and(eq(t.multiAgentRuns.id, id), eq(t.multiAgentRuns.workspaceId, workspaceId)));
  if (!parentRow) return undefined;

  const childRows = await db
    .select({ run: t.agentRuns, currentAgentName: t.agents.name })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(and(eq(t.agentRuns.multiAgentRunId, id), eq(t.agentRuns.workspaceId, workspaceId)))
    .orderBy(asc(t.agentRuns.ranAt), asc(t.agentRuns.id));

  const runIds = childRows.map((r) => r.run.id);
  const reviewByRun = new Map<string, { id: string; verdict: string | null; summary: string | null; score: number | null }>();
  const findingsByReview = new Map<string, FindingRow[]>();
  if (runIds.length > 0) {
    const reviewRows = await db
      .select()
      .from(t.reviews)
      .where(and(eq(t.reviews.workspaceId, workspaceId), inArray(t.reviews.runId, runIds)));
    for (const rv of reviewRows) if (rv.runId) reviewByRun.set(rv.runId, rv);
    if (reviewRows.length > 0) {
      const findingRows = await db
        .select()
        .from(t.findings)
        .where(inArray(t.findings.reviewId, reviewRows.map((r) => r.id)))
        .orderBy(asc(t.findings.file), asc(t.findings.startLine));
      for (const f of findingRows) {
        const list = findingsByReview.get(f.reviewId) ?? [];
        list.push(f);
        findingsByReview.set(f.reviewId, list);
      }
    }
  }

  return {
    parent: {
      id: parentRow.run.id,
      prId: parentRow.run.prId,
      prNumber: parentRow.prNumber ?? null,
      prTitle: parentRow.prTitle ?? null,
      ranAt: parentRow.run.ranAt,
      durationMs: parentRow.run.durationMs,
    },
    runs: childRows.map(({ run, currentAgentName }) => {
      const review = reviewByRun.get(run.id) ?? null;
      return {
        run,
        currentAgentName: currentAgentName ?? null,
        review: review ? { verdict: review.verdict, summary: review.summary, score: review.score } : null,
        findings: review ? (findingsByReview.get(review.id) ?? []) : [],
      };
    }),
  };
}

/** The last `limit` finished local runs of each agent (newest first) — the estimate window, one query. */
export async function recentDoneRunsForAgents(
  db: Db,
  workspaceId: string,
  agentIds: string[],
  limit: number,
): Promise<Map<string, { durationMs: number | null; costUsd: number | null }[]>> {
  const byAgent = new Map<string, { durationMs: number | null; costUsd: number | null }[]>();
  if (agentIds.length === 0) return byAgent;
  const rows = await db.execute<{ agent_id: string; duration_ms: number | null; cost_usd: number | null }>(sql`
    select agent_id, duration_ms, cost_usd from (
      select agent_id, duration_ms, cost_usd,
             row_number() over (partition by agent_id order by ran_at desc) as rn
      from agent_runs
      where workspace_id = ${workspaceId}
        and status = 'done' and source = 'local'
        and agent_id in (${sql.join(agentIds.map((id) => sql`${id}`), sql`, `)})
    ) ranked
    where rn <= ${limit}
  `);
  for (const r of rows) {
    const list = byAgent.get(r.agent_id) ?? [];
    list.push({ durationMs: r.duration_ms, costUsd: r.cost_usd });
    byAgent.set(r.agent_id, list);
  }
  return byAgent;
}

/** Stamp the parent's wall-clock once every child settled (duration from its ran_at). */
export async function finishMultiAgentRun(db: Db, id: string): Promise<void> {
  await db
    .update(t.multiAgentRuns)
    .set({
      finishedAt: sql`now()`,
      durationMs: sql`(extract(epoch from (now() - ${t.multiAgentRuns.ranAt})) * 1000)::int`,
    })
    .where(eq(t.multiAgentRuns.id, id));
}

/** True when the run belongs to the workspace (guards cancel / trace reads). */
export async function runExistsInWorkspace(
  db: Db,
  workspaceId: string,
  runId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: t.agentRuns.id })
    .from(t.agentRuns)
    .where(and(eq(t.agentRuns.id, runId), eq(t.agentRuns.workspaceId, workspaceId)));
  return !!row;
}

// ---- observability: agent_runs + run_traces -------------------------------

/** Create an agent_runs row in `running` state; returns its id (= the runId). */
export async function createAgentRun(
  db: Db,
  values: {
    workspaceId: string;
    agentId: string | null;
    prId: string;
    provider: string | null;
    model: string | null;
    multiAgentRunId?: string | null;
    agentName?: string | null;
  },
): Promise<string> {
  const [row] = await db
    .insert(t.agentRuns)
    .values({
      workspaceId: values.workspaceId,
      agentId: values.agentId,
      prId: values.prId,
      provider: values.provider,
      model: values.model,
      status: 'running',
      source: 'local',
      // clock_timestamp(), not the transaction's now(): siblings created in one transaction keep creation order.
      ranAt: sql`clock_timestamp()`,
      multiAgentRunId: values.multiAgentRunId ?? null,
      agentName: values.agentName ?? null,
    })
    .returning({ id: t.agentRuns.id });
  return row!.id;
}

export async function completeAgentRun(
  db: Db,
  runId: string,
  values: {
    status: 'done' | 'failed' | 'cancelled';
    durationMs: number;
    tokensIn: number;
    tokensOut: number;
    /** USD billed. Null = unknown (unpriced model / no usage returned). */
    costUsd?: number | null;
    findingsCount: number;
    grounding: string;
    /** Review score (0-100); null on failed/cancelled runs. */
    score?: number | null;
    /** Findings that tripped the agent's gate; 0 on failed/cancelled runs. */
    blockers?: number | null;
    /** Failure reason (status='failed') / cancellation note. Null clears it. */
    error?: string | null;
  },
): Promise<void> {
  await db
    .update(t.agentRuns)
    .set({
      status: values.status,
      durationMs: values.durationMs,
      tokensIn: values.tokensIn,
      tokensOut: values.tokensOut,
      costUsd: values.costUsd ?? null,
      findingsCount: values.findingsCount,
      grounding: values.grounding,
      score: values.score ?? null,
      blockers: values.blockers ?? null,
      error: values.error ?? null,
    })
    .where(eq(t.agentRuns.id, runId));
}

/** Persist the WHOLE run log as ONE document. PK = runId → agent_runs. */
export async function saveRunTrace(db: Db, runId: string, trace: RunTrace): Promise<void> {
  await db
    .insert(t.runTraces)
    .values({ runId, trace })
    .onConflictDoUpdate({ target: t.runTraces.runId, set: { trace } });
}

export async function getRunTrace(db: Db, runId: string): Promise<RunTrace | undefined> {
  const [row] = await db.select().from(t.runTraces).where(eq(t.runTraces.runId, runId));
  return row ? (row.trace as RunTrace) : undefined;
}

// ---- skills attribution (§5.4 / §3.3) --------------------------------------

/** All skills linked to an agent with both enabled flags; gating/ordering is in helpers.resolveRunSkills. */
export async function agentSkillLinks(db: Db, agentId: string) {
  const rows = await db
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
      },
    })
    .from(t.agentSkills)
    .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
    .where(eq(t.agentSkills.agentId, agentId));
  return rows;
}

/** Record which skills were in a run's prompt (idempotent). */
export async function insertRunSkills(db: Db, runId: string, skillIds: string[]): Promise<void> {
  if (skillIds.length === 0) return;
  await db
    .insert(t.runSkills)
    .values(skillIds.map((skillId) => ({ runId, skillId })))
    .onConflictDoNothing();
}
