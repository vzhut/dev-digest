import type { Container } from '../../platform/container.js';
import type {
  AgentRunEstimate,
  FindingActionKind,
  LearnFindingResponse,
  MultiAgentRunDetail,
  RunEventKind,
  RunRequest,
  RunTrace,
  SmartDiff,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import {
  averageEstimate,
  groupFindings,
  normalizeAgentIds,
  buildLearningContent,
  buildLearningSource,
  parentStatus,
  type ColumnStatus,
} from './multi-agent.js';
import type { AgentRow } from '../../db/rows.js';
import { ReviewRepository } from './repository.js';
import { findingRowToDto, type ReviewDto, type ReviewDtoFinding } from './helpers.js';
import { ReviewRunExecutor, type Logger } from './run-executor.js';
import { actOnFinding as actOnFindingImpl } from './findings.js';
import { reviewToDto } from './helpers.js';
import { buildSmartDiff, latestReviewFindings } from './smart-diff/build.js';

// Re-export DTO types + converters for backward-compatible imports from
// './service.js' (these previously lived here; logic now in ./helpers.ts).
export { findingRowToDto, reviewToDto } from './helpers.js';
export type { ReviewDto, ReviewDtoFinding } from './helpers.js';

const ESTIMATE_WINDOW = 5;

/**
 * Review service (the core). Orchestrates:
 *   diff → assemblePrompt(system + repo-map + diff)
 *        → llm.completeStructured({ schema: Review }) (single-pass)
 *        → groundFindings(...) (citation gate — drops findings off the diff)
 *        → persist reviews + kept findings (+ grounding summary)
 *   while streaming RunEvents over container.runBus, and on completion writing
 *   the whole log as ONE RunTrace doc + an agent_runs row.
 *
 * Also: the finding accept/dismiss actions. The bulky run execution lives in
 * run-executor; this class keeps the public method surface.
 */
export class ReviewService {
  private repo: ReviewRepository;
  private agents: Container['agentsRepo'];
  private executor: ReviewRunExecutor;

  constructor(private container: Container) {
    this.repo = new ReviewRepository(container.db);
    this.agents = container.agentsRepo;
    this.executor = new ReviewRunExecutor(container, this.repo, this.agents);
  }

  // ===========================================================================
  // Run a review for one or all enabled agents on a PR.
  // ===========================================================================

  /**
   * Resolve which agents to run. `all` → all enabled agents; else a single agent.
   */
  async resolveTargets(
    workspaceId: string,
    opts: { agentId?: string; all?: boolean },
  ): Promise<AgentRow[]> {
    if (opts.all) return this.agents.listEnabled(workspaceId);
    if (opts.agentId) {
      const agent = await this.agents.getById(workspaceId, opts.agentId);
      if (!agent) throw new NotFoundError('Agent not found');
      return [agent];
    }
    throw new AppError('invalid_run_request', 'Provide agentId or all:true', 400);
  }

  /**
   * Resolve the agents of a multi-agent start: every id must exist in the
   * workspace (disabled agents are accepted — the user picked them). Any
   * unknown / foreign id → 404 before anything is written.
   */
  async resolveAgentIds(
    workspaceId: string,
    body: { agentIds: string[]; agentId?: string | undefined; all?: boolean | undefined },
  ): Promise<AgentRow[]> {
    const ids = normalizeAgentIds(body);
    const agents: AgentRow[] = [];
    for (const id of ids) {
      const agent = await this.agents.getById(workspaceId, id);
      if (!agent) throw new NotFoundError('Agent not found');
      agents.push(agent);
    }
    return agents;
  }

  /** Delete a whole review run (one agent's pass) + its findings (cascade). */
  async deleteReview(workspaceId: string, reviewId: string): Promise<boolean> {
    return this.repo.deleteReview(workspaceId, reviewId);
  }

  /** In-flight runs for a PR (server-side source of truth, survives reload). */
  async activeRuns(workspaceId: string, prId: string) {
    return this.repo.activeRunsForPull(workspaceId, prId);
  }

  /** All runs for a PR (any status), newest first — the run history (incl. failures). */
  async listRuns(workspaceId: string, prId: string) {
    return this.repo.listRunsForPull(workspaceId, prId);
  }

  /** Delete one run from the history (+ its trace). */
  async deleteRun(workspaceId: string, runId: string): Promise<boolean> {
    return this.repo.deleteAgentRun(workspaceId, runId);
  }

  /**
   * Cancel an in-flight run. Signals a live runner to stop at its next
   * checkpoint AND marks the DB row cancelled + completes the bus immediately —
   * so cancel also works for ORPHANED runs (whose background process died on a
   * server restart) where signalling alone would do nothing.
   */
  async cancelRun(workspaceId: string, runId: string): Promise<void> {
    await this.assertRunInWorkspace(workspaceId, runId);
    this.publish(runId, 'info', 'Cancellation requested — stopping…');
    this.container.runBus.cancel(runId);
    await this.repo.cancelRunIfRunning(runId);
    this.container.runBus.complete(runId);
  }

  private async assertRunInWorkspace(workspaceId: string, runId: string): Promise<void> {
    if (!(await this.repo.runExistsInWorkspace(workspaceId, runId))) {
      throw new NotFoundError('Run not found');
    }
  }

  /** Reap runs left 'running' by a previous (now-dead) process. Called on boot. */
  async reapStaleRuns(): Promise<number> {
    return this.repo.reapStaleRunningRuns();
  }

  /**
   * Start a review from a parsed run request: `agent_ids` → multi-agent (parent run +
   * linked children), else the legacy `agentId` / `all` forms. One call for the route.
   */
  async startReview(
    workspaceId: string,
    prId: string,
    body: RunRequest,
    logger?: Logger,
    correlationId?: string,
  ): Promise<{
    pr_id: string;
    runs: { run_id: string; agent_id: string; agent_name: string }[];
    reviews: ReviewDto[];
    multi_agent_run_id?: string;
  }> {
    const multi = body.agent_ids !== undefined;
    const targets = multi
      ? await this.resolveAgentIds(workspaceId, {
          agentIds: body.agent_ids!,
          agentId: body.agentId,
          all: body.all,
        })
      : await this.resolveTargets(workspaceId, {
          ...(body.agentId !== undefined ? { agentId: body.agentId } : {}),
          ...(body.all !== undefined ? { all: body.all } : {}),
        });
    const { runs, reviews, multi_agent_run_id } = await this.runReview(
      workspaceId,
      prId,
      targets,
      logger,
      correlationId,
      { multiAgent: multi },
    );
    return { pr_id: prId, ...(multi_agent_run_id ? { multi_agent_run_id } : {}), runs, reviews };
  }

  /**
   * Run a review for each target agent. Each agent gets its own runId
   * (= agent_runs.id) created up-front so the SSE route can be subscribed
   * before/while the run progresses. A partial failure in one agent does not
   * abort the others.
   */
  async runReview(
    workspaceId: string,
    prId: string,
    targets: AgentRow[],
    logger?: Logger,
    /** The request id: ties the intent call and every agent's review together in the logs. */
    correlationId?: string,
    /** Multi-agent start: create a parent run and link every child to it. */
    opts?: { multiAgent?: boolean },
  ): Promise<{
    runs: { run_id: string; agent_id: string; agent_name: string }[];
    reviews: ReviewDto[];
    multi_agent_run_id?: string;
  }> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    // Create the agent_run rows up front so a runId is available IMMEDIATELY —
    // the client persists these in global state and subscribes to the SSE
    // stream. The actual (slow) review runs in the background below.
    // Parent + children are created in one transaction so a DB failure never leaves a partial set.
    const { multiAgentRunId, runs, jobs } = await this.container.db.transaction(async (tx) => {
      const parentId = opts?.multiAgent
        ? await this.repo.createMultiAgentRun({ workspaceId, prId }, tx)
        : undefined;
      const created: { run_id: string; agent_id: string; agent_name: string }[] = [];
      const queued: { agent: AgentRow; runId: string }[] = [];
      for (const agent of targets) {
        const runId = await this.repo.createAgentRun(
          {
            workspaceId,
            agentId: agent.id,
            prId,
            provider: agent.provider,
            model: agent.model,
            agentName: agent.name,
            ...(parentId ? { multiAgentRunId: parentId } : {}),
          },
          tx,
        );
        created.push({ run_id: runId, agent_id: agent.id, agent_name: agent.name });
        queued.push({ agent, runId });
      }
      return { multiAgentRunId: parentId, runs: created, jobs: queued };
    });

    // Fire-and-forget: the HTTP response returns now with the runIds; reviews
    // are persisted as each agent finishes and the client refetches on SSE done.
    void this.executor.executeRuns(workspaceId, pull, repo, jobs, logger, correlationId, multiAgentRunId).catch((err) => {
      logger?.error({ prId, err: (err as Error).message }, 'review: background execution crashed');
    });

    return { runs, reviews: [], ...(multiAgentRunId ? { multi_agent_run_id: multiAgentRunId } : {}) };
  }

  private publish(runId: string, kind: RunEventKind, msg: string, data?: unknown) {
    return this.container.runBus.publish(runId, kind, msg, data);
  }

  // ===========================================================================
  // Finding actions
  // ===========================================================================

  async actOnFinding(
    workspaceId: string,
    findingId: string,
    action: FindingActionKind,
  ): Promise<{ finding: ReviewDtoFinding }> {
    return actOnFindingImpl(this.repo, workspaceId, findingId, action);
  }

  /**
   * Save a finding as a repo learning (no LLM, no embedding). Idempotent: the
   * `learned_at IS NULL` claim and the memory insert share one transaction, so
   * a double click yields one memory row and the second call returns it with
   * `created: false`.
   */
  async learnFinding(workspaceId: string, findingId: string): Promise<LearnFindingResponse> {
    const ctx = await this.repo.findingContext(findingId);
    if (!ctx || ctx.pull.workspaceId !== workspaceId) throw new NotFoundError('Finding not found');
    const { finding: ctxFinding, review, pull } = ctx;
    const attribution = review.runId ? await this.repo.getRunAttribution(review.runId) : undefined;
    const agent = review.agentId ? await this.agents.getById(workspaceId, review.agentId) : undefined;

    return this.container.db.transaction(async (tx) => {
      const now = new Date();
      const claimed = await this.repo.claimFindingLearned(findingId, now, tx);
      const current = claimed ?? (await this.repo.getFindingFor(findingId, tx)) ?? ctxFinding;
      if (!claimed && current.learnedMemoryId) {
        const existing = await this.repo.getMemory(current.learnedMemoryId, tx);
        if (existing) {
          return {
            finding: findingRowToDto(current),
            memory: { id: existing.id, kind: 'learning' as const, scope: 'repo' as const, content: existing.content, created: false },
          };
        }
      }
      const content = buildLearningContent(current);
      const memoryRow = await this.repo.insertLearning(
        {
          workspaceId,
          repoId: pull.repoId,
          content,
          confidence: Math.min(1, Math.max(0, current.confidence)),
          sources: [
            buildLearningSource({
              prNumber: pull.number,
              findingId,
              prId: pull.id,
              runId: review.runId,
              multiAgentRunId: attribution?.multiAgentRunId ?? null,
              agentId: agent?.id ?? null,
              agentName: attribution?.agentName ?? agent?.name ?? null,
              decision: current.acceptedAt ? 'accepted' : current.dismissedAt ? 'dismissed' : 'undecided',
              learnedAt: now,
            }),
          ],
        },
        tx,
      );
      const linked = await this.repo.linkFindingMemory(findingId, memoryRow.id, current.learnedAt ?? now, tx);
      return {
        finding: findingRowToDto(linked),
        memory: { id: memoryRow.id, kind: 'learning' as const, scope: 'repo' as const, content, created: true },
      };
    });
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  async reviewsForPull(workspaceId: string, prId: string): Promise<ReviewDto[]> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const rows = await this.repo.reviewsForPull(prId);
    const names = new Map<string, string>();
    for (const { review } of rows) {
      if (review.agentId && !names.has(review.agentId)) {
        const a = await this.agents.getById(workspaceId, review.agentId);
        if (a) names.set(review.agentId, a.name);
      }
    }
    return rows.map(({ review, findings, usage }) =>
      reviewToDto(review, findings, review.agentId ? names.get(review.agentId) : null, usage),
    );
  }

  /** Smart Diff: files grouped by role + finding lines of the latest review. No LLM call. */
  async smartDiff(workspaceId: string, prId: string): Promise<SmartDiff> {
    // getPull first: reviewsForPull/getPrFiles are not workspace-scoped.
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const files = await this.repo.getPrFiles(prId);
    const rows = await this.repo.reviewsForPull(prId);
    return buildSmartDiff(
      files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions })),
      latestReviewFindings(
        rows.map(({ review, findings }) => ({
          kind: review.kind,
          findings: findings.map((f) => ({ file: f.file, start_line: f.startLine })),
        })),
      ),
    );
  }

  /** Id of the repo's most recent parent multi-agent run (workspace-scoped), or null. */
  async latestMultiAgentRun(workspaceId: string, repoId: string): Promise<{ id: string | null }> {
    return { id: await this.repo.latestMultiAgentRunId(workspaceId, repoId) };
  }

  /** Id of a PR's most recent parent multi-agent run (workspace-scoped), or null. */
  async latestMultiAgentRunForPull(workspaceId: string, prId: string): Promise<{ id: string | null }> {
    return { id: await this.repo.latestMultiAgentRunIdForPull(workspaceId, prId) };
  }

  /** Parent multi-agent run: columns, grouped findings / disagreements, derived status. No LLM. */
  async getMultiAgentRun(workspaceId: string, id: string): Promise<MultiAgentRunDetail> {
    const data = await this.repo.getMultiAgentRunData(workspaceId, id);
    if (!data) throw new NotFoundError('Multi-agent run not found');

    const columns: MultiAgentRunDetail['columns'] = data.runs.map(({ run, currentAgentName, review, findings }) => {
      const status: ColumnStatus =
        run.status === 'running' || run.status === 'done' || run.status === 'cancelled' ? run.status : 'failed';
      return {
        run_id: run.id,
        agent_id: run.agentId ?? '',
        agent_name: run.agentName ?? currentAgentName ?? 'Unknown agent',
        provider: run.provider,
        model: run.model,
        status,
        verdict: review?.verdict ?? null,
        score: review?.score ?? run.score,
        summary: review?.summary ?? null,
        duration_ms: run.durationMs,
        cost_usd: run.costUsd,
        error: run.error,
        findings: findings.map(findingRowToDto),
      };
    });

    const conflicts = groupFindings(
      columns.map((c) => ({ runId: c.run_id, agentId: c.agent_id, agentName: c.agent_name, status: c.status as ColumnStatus })),
      columns
        .filter((c) => c.status === 'done')
        .flatMap((c) =>
          c.findings.map((f) => ({
            id: f.id,
            runId: c.run_id,
            severity: f.severity,
            category: f.category,
            title: f.title,
            file: f.file,
            startLine: f.start_line,
            endLine: f.end_line,
            rationale: f.rationale,
          })),
        ),
    );

    const knownCosts = columns.map((c) => c.cost_usd).filter((v): v is number => v !== null);
    // The parent's duration is stamped when its last child settles. If that never happened
    // (e.g. the server restarted mid-run) but every child is finished, the agents ran in
    // parallel, so the wall-clock is the slowest child.
    const durations = columns.map((c) => c.duration_ms).filter((v): v is number => v !== null);
    const allSettled = columns.every((c) => c.status !== 'running');
    const totalDuration =
      data.parent.durationMs ?? (allSettled && durations.length > 0 ? Math.max(...durations) : null);
    return {
      id: data.parent.id,
      pr_id: data.parent.prId,
      pr_number: data.parent.prNumber,
      pr_title: data.parent.prTitle,
      ran_at: data.parent.ranAt.toISOString(),
      agent_count: columns.length,
      total_duration_ms: totalDuration,
      total_cost_usd: knownCosts.length === 0 ? null : knownCosts.reduce((a, b) => a + b, 0),
      status: parentStatus(columns.map((c) => c.status as ColumnStatus)),
      columns,
      conflicts,
    };
  }

  /** History estimate per enabled agent: average of its last 5 finished local runs. */
  async agentEstimates(workspaceId: string): Promise<AgentRunEstimate[]> {
    const enabled = await this.agents.listEnabled(workspaceId);
    const history = await this.repo.recentDoneRunsForAgents(
      workspaceId,
      enabled.map((a) => a.id),
      ESTIMATE_WINDOW,
    );
    return enabled.map((agent) => ({
      agent_id: agent.id,
      ...averageEstimate(history.get(agent.id) ?? []),
    }));
  }

  async getRunTrace(workspaceId: string, runId: string): Promise<RunTrace | undefined> {
    await this.assertRunInWorkspace(workspaceId, runId);
    return this.repo.getRunTrace(runId);
  }
}
