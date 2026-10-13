import type {
  AgentEvalCase,
  AgentEvalCaseDetail,
  CreateEvalCaseResponse,
  EvalAgentCard,
  EvalAgentDashboard,
  EvalCaseWrite,
  EvalFindingLink,
  EvalRecentRun,
  EvalRunCompare,
  EvalSuiteRun,
  EvalSuiteRunDetail,
  EvalWorkspaceDashboard,
  LLMProvider,
  Provider,
  RunAllEvalResponse,
  StartEvalRunResponse,
  UnifiedDiff,
} from '@devdigest/shared';
import type { ReviewStrategy } from '@devdigest/reviewer-core';
import type { PinoLike } from '../../platform/run-logger.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { redactSecrets } from '../_shared/redact.js';
import { resolveRunSkills, toPromptSkills } from '../_shared/run-skills.js';
import { regressions } from './callout.js';
import {
  AGENT_RUNS_LIMIT,
  MAX_CASES_PER_AGENT,
  CASE_ERROR_REASON,
  ORPHANED_RUN_REASON,
  RECENT_RUNS_LIMIT,
  TREND_POINTS,
} from './constants.js';
import { EvalRequestError } from './errors.js';
import { EvalExecutor } from './executor.js';
import {
  caseMetaFrom,
  caseName,
  checkManualCase,
  expectationFromFinding,
  expectationFromInput,
  isExpectationGrounded,
  synthesizeFrozenDiff,
} from './frozen-input.js';
import {
  toAgentEvalCase,
  toAgentEvalCaseDetail,
  toEvalSuiteRun,
  toEvalSuiteRunDetail,
  toFindingLink,
  toRunnableCase,
  toTrendPoint,
} from './helpers.js';
import { compareRuns } from './prompt-diff.js';
import type { EvalRepository } from './repository.js';

/** Narrow dependencies (no `Container`, no other module's folder) — wired in `routes.ts`. */
export interface EvalServiceDeps {
  repo: Pick<
    EvalRepository,
    | 'findFindingContext'
    | 'findCaseBySource'
    | 'insertCase'
    | 'insertManualCase'
    | 'updateCase'
    | 'agentExists'
    | 'pullExists'
    | 'listCasesForAgent'
    | 'listCaseSummaries'
    | 'completedRunsForAgents'
    | 'lastResultsForAgent'
    | 'getCase'
    | 'deleteCase'
    | 'caseLinksForPull'
    | 'agentSnapshot'
    | 'countCases'
    | 'insertRunningRun'
    | 'markProgress'
    | 'finishRun'
    | 'failRun'
    | 'failOrphanedRunning'
    | 'listRunsForAgent'
    | 'getRun'
    | 'recentRuns'
    | 'agentsWithCases'
  >;
  parseDiff: (raw: string) => UnifiedDiff;
  /** Resolves the agent's LLM provider (throws when its key is missing). */
  llm: (provider: Provider) => Promise<LLMProvider>;
  log: PinoLike;
  now?: () => number;
}

export class EvalService {
  constructor(private deps: EvalServiceDeps) {}

  /**
   * Freeze an eval case from a decided finding: accepted → `must_find`, dismissed → `must_not_flag`,
   * owned by the agent that produced it. Nothing is persisted unless every check passes, and a second
   * call for the same finding returns the existing case (AC-6).
   */
  async createFromFinding(workspaceId: string, findingId: string): Promise<CreateEvalCaseResponse> {
    const { repo, parseDiff } = this.deps;
    const ctx = await repo.findFindingContext(workspaceId, findingId);
    if (!ctx) throw new NotFoundError('Finding not found');

    const { finding } = ctx;
    const decision = finding.acceptedAt ? 'accepted' : finding.dismissedAt ? 'dismissed' : null;
    if (!decision) {
      throw new EvalRequestError('finding_not_triaged', 'Accept or dismiss this finding first');
    }
    const agentId = ctx.review.agentId;
    if (!agentId || !ctx.agentExists) {
      throw new EvalRequestError('finding_has_no_agent', 'This finding has no producing agent');
    }

    const existing = await repo.findCaseBySource(workspaceId, finding.id, agentId);
    if (existing) return this.respond(workspaceId, existing, false);

    const frozen = synthesizeFrozenDiff(finding.file, ctx.patch, {
      start_line: finding.startLine,
      end_line: finding.endLine,
    });
    if (!frozen.ok) throw new EvalRequestError('diff_unavailable', `Diff unavailable: ${frozen.reason}`);

    const expectation = expectationFromFinding(finding, decision);
    if (!isExpectationGrounded(parseDiff(frozen.diff), expectation)) {
      throw new EvalRequestError(
        'expectation_not_grounded',
        "The finding's lines are outside the stored diff of its file",
      );
    }

    const inserted = await repo.insertCase(
      {
      workspaceId,
      agentId,
      sourceFindingId: finding.id,
      name: caseName(expectation.type, finding.title),
      inputDiff: frozen.diff,
      inputFiles: [finding.file],
      inputMeta: caseMetaFrom({
        findingId: finding.id,
        reviewId: ctx.review.id,
        runId: ctx.review.runId,
        repo: `${ctx.repo.owner}/${ctx.repo.name}`,
        prNumber: ctx.pull.number,
        headSha: ctx.pull.headSha,
        prTitle: ctx.pull.title,
        prBody: ctx.pull.body,
      }),
      expectedOutput: expectation,
    },
      MAX_CASES_PER_AGENT,
    );
    if (inserted.kind === 'limit') throw this.limitError();
    return this.respond(workspaceId, inserted.row, inserted.kind === 'created');
  }

  /** A case written by hand in the editor (AC-43): validated like a produced finding, no source finding. */
  async createManual(workspaceId: string, agentId: string, body: EvalCaseWrite): Promise<CreateEvalCaseResponse> {
    const { repo, parseDiff } = this.deps;
    if (!(await repo.agentExists(workspaceId, agentId))) throw new NotFoundError('Agent not found');
    const check = checkManualCase(body.input_diff, body.expectation, parseDiff);
    if (!check.ok) throw new EvalRequestError(check.code, check.reason);
    const inserted = await repo.insertManualCase(
      {
      workspaceId,
      agentId,
      name: body.name,
      inputDiff: body.input_diff,
      inputFiles: check.files,
      inputMeta: { pr_title: body.pr_title?.trim() || body.name, pr_body: body.pr_body ?? null },
      expectedOutput: expectationFromInput(body.expectation),
      notes: body.notes ?? null,
    },
      MAX_CASES_PER_AGENT,
    );
    if (inserted.kind === 'limit') throw this.limitError();
    return this.respond(workspaceId, inserted.row, true);
  }

  /**
   * Edit a case (AC-44): same validation as creating one. Earlier runs keep their stored results; a case frozen
   * from a finding keeps its provenance (and its PR meta), a hand-written one may change its PR title/body.
   */
  async updateCase(workspaceId: string, caseId: string, body: EvalCaseWrite): Promise<AgentEvalCaseDetail> {
    const { repo, parseDiff } = this.deps;
    const existing = await repo.getCase(workspaceId, caseId);
    if (!existing || !existing.agentId) throw new NotFoundError('Eval case not found');
    const check = checkManualCase(body.input_diff, body.expectation, parseDiff);
    if (!check.ok) throw new EvalRequestError(check.code, check.reason);
    const born = existing.sourceFindingId != null;
    const meta = existing.inputMeta ?? { pr_title: body.name };
    const row = await repo.updateCase(workspaceId, caseId, {
      name: body.name,
      inputDiff: body.input_diff,
      inputFiles: check.files,
      inputMeta: born ? meta : { ...meta, pr_title: body.pr_title?.trim() || body.name, pr_body: body.pr_body ?? null },
      expectedOutput: expectationFromInput(body.expectation, existing.expectedOutput?.label),
      notes: body.notes ?? null,
    });
    const last = (await repo.lastResultsForAgent(workspaceId, existing.agentId)).get(caseId);
    const detail = row ? toAgentEvalCaseDetail(row, last) : null;
    if (!detail) throw new NotFoundError('Eval case not found');
    return detail;
  }

  private limitError(): EvalRequestError {
    return new EvalRequestError('case_limit_reached', `An agent can own at most ${MAX_CASES_PER_AGENT} eval cases`);
  }

  async listCases(workspaceId: string, agentId: string): Promise<AgentEvalCase[]> {
    const { repo } = this.deps;
    if (!(await repo.agentExists(workspaceId, agentId))) throw new NotFoundError('Agent not found');
    const [rows, last] = await Promise.all([
      repo.listCaseSummaries(workspaceId, agentId),
      repo.lastResultsForAgent(workspaceId, agentId),
    ]);
    return rows.flatMap((row) => toAgentEvalCase(row, last.get(row.id)) ?? []);
  }

  async getCase(workspaceId: string, caseId: string): Promise<AgentEvalCaseDetail> {
    const { repo } = this.deps;
    const row = await repo.getCase(workspaceId, caseId);
    const last = row?.agentId ? (await repo.lastResultsForAgent(workspaceId, row.agentId)).get(row.id) : undefined;
    const detail = row ? toAgentEvalCaseDetail(row, last) : null;
    if (!detail) throw new NotFoundError('Eval case not found');
    return detail;
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<void> {
    if (!(await this.deps.repo.deleteCase(workspaceId, caseId))) throw new NotFoundError('Eval case not found');
  }

  async linksForPull(workspaceId: string, prId: string): Promise<EvalFindingLink[]> {
    const { repo } = this.deps;
    if (!(await repo.pullExists(workspaceId, prId))) throw new NotFoundError('Pull request not found');
    const links = await repo.caseLinksForPull(workspaceId, prId);
    return links.flatMap((l) => toFindingLink(l) ?? []);
  }

  // ---- runs ----------------------------------------------------------------

  /**
   * Start an eval run over ALL of the agent's current cases with its CURRENT config, and return at
   * once: the cases run in the background (AC-14). The run row is persisted `running` first, so a
   * reload sees it (AC-17) and a second start is a 409 (AC-18).
   */
  async startRun(
    workspaceId: string,
    agentId: string,
    opts: { correlationId: string; caseIds?: string[] },
  ): Promise<StartEvalRunResponse> {
    const { repo, parseDiff, llm, log } = this.deps;
    const snap = await repo.agentSnapshot(workspaceId, agentId);
    if (!snap) throw new NotFoundError('Agent not found');
    const all = (await repo.listCasesForAgent(workspaceId, agentId)).flatMap((row) => toRunnableCase(row) ?? []);
    // A subset run (AC-46): every id must be one of THIS agent's cases (a foreign or unknown id is a 422).
    const wanted = opts.caseIds ? [...new Set(opts.caseIds)] : null;
    if (wanted && wanted.some((id) => !all.some((c) => c.id === id))) {
      throw new EvalRequestError('unknown_case', 'One or more case ids do not belong to this agent');
    }
    const cases = wanted ? all.filter((c) => wanted.includes(c.id)) : all;
    if (cases.length === 0) throw new EvalRequestError('no_eval_cases', 'This agent has no eval cases yet');

    const skills = resolveRunSkills(snap.skillLinks);
    const versionById = new Map(snap.skillLinks.map((l) => [l.skill.id, l.skill.version]));
    const { agent } = snap;
    const inserted = await repo.insertRunningRun({
      workspaceId,
      agentId,
      agentVersion: agent.version,
      provider: agent.provider,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      strategy: agent.strategy,
      skills: skills.map((s) => ({ id: s.id, name: s.name, version: versionById.get(s.id) ?? null })),
      caseIds: cases.map((c) => c.id),
    });
    if (!inserted.ok) {
      throw new EvalRequestError('eval_run_in_progress', 'An eval run for this agent is already running', 409);
    }
    const run = inserted.run;

    const executor = new EvalExecutor({
      llm,
      parseDiff,
      store: {
        markProgress: (id, p) => repo.markProgress(id, p),
        finish: (id, o) => repo.finishRun(id, o),
      },
      log,
      now: this.deps.now ?? Date.now,
      correlationId: opts.correlationId,
    });
    // Never awaited: the request returns now. A rejection here must not escape (an unhandled
    // rejection would take the API down), so it is persisted on the run instead.
    void executor
      .runSuite(
        {
          runId: run.id,
          provider: agent.provider as Provider,
          model: agent.model,
          systemPrompt: agent.systemPrompt,
          strategy: agent.strategy as ReviewStrategy,
          skills: toPromptSkills(skills),
        },
        cases,
      )
      .catch(async (err: unknown) => {
        // the stored reason is stable; the detail (redacted) is for the server log only
        const detail = redactSecrets(err instanceof Error ? err.message : String(err));
        log.error({ event: 'eval.run.failed', run_id: run.id, correlation_id: opts.correlationId, detail }, 'eval run failed');
        await repo.failRun(run.id, CASE_ERROR_REASON.runFailed).catch((e: unknown) =>
          log.error({ event: 'eval.run.fail_persist_failed', run_id: run.id, error: redactSecrets(String(e)) }, 'could not persist the failed eval run'),
        );
      });
    return { eval_run_id: run.id, status: 'running' };
  }

  async listRuns(workspaceId: string, agentId: string): Promise<EvalSuiteRun[]> {
    const { repo } = this.deps;
    if (!(await repo.agentExists(workspaceId, agentId))) throw new NotFoundError('Agent not found');
    const rows = await repo.listRunsForAgent(workspaceId, agentId, AGENT_RUNS_LIMIT);
    return rows.flatMap((r) => toEvalSuiteRun(r) ?? []);
  }

  async getRun(workspaceId: string, runId: string): Promise<EvalSuiteRunDetail> {
    const row = await this.deps.repo.getRun(workspaceId, runId);
    const detail = row ? toEvalSuiteRunDetail(row) : null;
    if (!detail) throw new NotFoundError('Eval run not found');
    return detail;
  }

  /** Two runs of the SAME agent; the earlier `ran_at` is "old" whatever the argument order (AC-31). */
  async compare(workspaceId: string, aId: string, bId: string): Promise<EvalRunCompare> {
    const [a, b] = await Promise.all([this.getRun(workspaceId, aId), this.getRun(workspaceId, bId)]);
    if (a.agent_id !== b.agent_id) {
      throw new EvalRequestError('compare_different_agents', 'Only runs of the same agent can be compared');
    }
    return compareRuns(a, b);
  }

  async workspaceDashboard(workspaceId: string): Promise<EvalWorkspaceDashboard> {
    const { repo } = this.deps;
    const agents = await repo.agentsWithCases(workspaceId);
    // each agent's card comes from ITS OWN newest completed runs, so a busy agent cannot push another one's runs out
    const [completed, recent] = await Promise.all([
      repo.completedRunsForAgents(workspaceId, agents.map((a) => a.id), TREND_POINTS),
      repo.recentRuns(workspaceId, RECENT_RUNS_LIMIT),
    ]);
    const finishedByAgent = new Map<string, EvalSuiteRun[]>();
    for (const row of completed) {
      const run = toEvalSuiteRun(row);
      if (run) finishedByAgent.set(run.agent_id, [...(finishedByAgent.get(run.agent_id) ?? []), run]);
    }
    for (const runs of finishedByAgent.values()) runs.sort((a, b) => Date.parse(b.ran_at) - Date.parse(a.ran_at)); // newest first
    const cards: EvalAgentCard[] = agents.map((agent) => {
      const finished = finishedByAgent.get(agent.id) ?? [];
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        model: agent.model,
        cases_total: agent.casesTotal,
        latest_run: finished[0] ?? null,
        trend: finished.slice(0, TREND_POINTS).reverse().map(toTrendPoint),
      };
    });
    const recent_runs: EvalRecentRun[] = recent.flatMap((row) => {
      const run = toEvalSuiteRun(row);
      return run ? [{ ...run, agent_name: row.agentName }] : [];
    });
    return { cards, recent_runs };
  }

  async agentDashboard(workspaceId: string, agentId: string): Promise<EvalAgentDashboard> {
    const { repo } = this.deps;
    const snap = await repo.agentSnapshot(workspaceId, agentId);
    if (!snap) throw new NotFoundError('Agent not found');
    const [casesTotal, rows] = await Promise.all([
      repo.countCases(workspaceId, agentId),
      repo.listRunsForAgent(workspaceId, agentId, AGENT_RUNS_LIMIT),
    ]);
    const runs = rows.flatMap((r) => toEvalSuiteRun(r) ?? []);
    const finished = runs.filter((r) => r.status === 'completed'); // newest first
    const latest = finished[0] ?? null;
    const previous = finished[1] ?? null;
    return {
      agent_id: agentId,
      agent_name: snap.agent.name,
      model: snap.agent.model,
      cases_total: casesTotal,
      latest,
      previous,
      trend: finished.slice(0, TREND_POINTS).reverse().map(toTrendPoint),
      runs,
      regression: latest && previous ? regressions(latest, previous) : [],
    };
  }

  /**
   * Start a run for every agent that has cases. One agent failing never discards the runs already started:
   * every failure is recorded per agent in `skipped` (an unexpected one as `internal_error`, detail in the log)
   * and only a total failure (nothing started, something unexpected) is rethrown.
   */
  async runAll(workspaceId: string, opts: { correlationId: string }): Promise<RunAllEvalResponse> {
    const agents = await this.deps.repo.agentsWithCases(workspaceId);
    const started: string[] = [];
    const skipped: RunAllEvalResponse['skipped'] = [];
    let unexpected: unknown;
    for (const agent of agents) {
      try {
        await this.startRun(workspaceId, agent.id, opts);
        started.push(agent.id);
      } catch (err) {
        if (err instanceof AppError) {
          skipped.push({ agent_id: agent.id, reason: err.code });
          continue;
        }
        unexpected ??= err;
        this.deps.log.error(
          { event: 'eval.run_all.agent_failed', agent_id: agent.id, correlation_id: opts.correlationId, detail: redactSecrets(String(err)) },
          'run-all: could not start an agent',
        );
        skipped.push({ agent_id: agent.id, reason: 'internal_error' });
      }
    }
    if (started.length === 0 && unexpected !== undefined) throw unexpected;
    return { started, skipped };
  }

  /** Mark runs a dead process left `running` as errored (best effort: called once at boot). */
  async failOrphanedRuns(): Promise<number> {
    return this.deps.repo.failOrphanedRunning(ORPHANED_RUN_REASON);
  }

  private async respond(
    workspaceId: string,
    row: Parameters<typeof toAgentEvalCaseDetail>[0],
    created: boolean,
  ): Promise<CreateEvalCaseResponse> {
    const last = row.agentId
      ? (await this.deps.repo.lastResultsForAgent(workspaceId, row.agentId)).get(row.id)
      : undefined;
    const detail = toAgentEvalCaseDetail(row, last);
    if (!detail) throw new NotFoundError('Eval case not found');
    return { case: detail, created };
  }
}
