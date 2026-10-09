import type { EvalCaseResult, LLMProvider } from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import { AppError } from '../../platform/errors.js';
import { redactSecrets } from '../_shared/redact.js';
import { CASE_ERROR_REASON, CASE_TIMEOUT_MS, TASK_TITLE_MAX_CHARS } from './constants.js';
import type { EvalExecutorDeps, EvalRunSnapshot, EvalRunnableCase } from './ports.js';
import { errorCaseOutcome, scoreCase, scoreRun } from './scoring.js';

/**
 * Runs every case of an eval run, one review call per case, over the case's FROZEN input with the
 * agent's config snapshot. No intent, specs, callers, repo map or memory is passed, so a case never
 * reads the PR, the clone or GitHub (AC-4, AC-15). A failing case becomes an `error` result and the
 * loop carries on (AC-20); logs carry ids, timings, cost and metrics only — never diff, PR or prompt text.
 */
export class EvalExecutor {
  constructor(private readonly deps: EvalExecutorDeps) {}

  async runSuite(snapshot: EvalRunSnapshot, cases: EvalRunnableCase[]): Promise<EvalCaseResult[]> {
    const { log, store, now, correlationId } = this.deps;
    const ids = { correlation_id: correlationId, run_id: snapshot.runId };
    const startedAt = now();
    log.info(
      { ...ids, event: 'eval.run.started', cases: cases.length, provider: snapshot.provider, model: snapshot.model },
      `eval run started: ${cases.length} case(s)`,
    );

    // One provider lookup per run: a missing key errors every case with the same reason (D5).
    let llm: LLMProvider | null = null;
    let providerError: string | null = null;
    try {
      llm = await this.deps.llm(snapshot.provider);
    } catch (err) {
      // an AppError (e.g. "OPENROUTER_API_KEY is not configured") is our own actionable message; anything else is opaque
      providerError =
        err instanceof AppError
          ? `${CASE_ERROR_REASON.providerUnavailable}: ${redactSecrets(err.message)}`
          : CASE_ERROR_REASON.providerUnavailable;
      log.warn(
        { ...ids, event: 'eval.run.provider_unavailable', provider: snapshot.provider, detail: redactSecrets(errorMessage(err)) },
        'eval provider unavailable',
      );
    }

    const results: EvalCaseResult[] = [];
    for (const c of cases) {
      const caseStart = now();
      let result: EvalCaseResult;
      let detail: string | undefined; // raw provider detail: server log only, never stored or returned
      try {
        if (!llm) throw new CaseError(providerError ?? 'provider unavailable');
        result = await this.runCase(snapshot, c, llm, caseStart);
      } catch (err) {
        const reason = classifyError(err);
        detail = err instanceof CaseError ? undefined : redactSecrets(errorMessage(err));
        result = errorCaseOutcome(c.id, reason, {
          caseName: c.name,
          expectation: c.expectation,
          durationMs: now() - caseStart,
        });
      }
      results.push(result);
      log.info(
        {
          ...ids,
          event: 'eval.case.finished',
          case_id: c.id,
          status: result.status,
          ms: result.duration_ms,
          cost_usd: result.cost_usd,
          ...(result.status === 'error' ? { error: result.error, ...(detail ? { detail } : {}) } : {}),
        },
        `eval case ${result.status}`,
      );
      await store.markProgress(snapshot.runId, { casesDone: results.length });
    }

    const score = scoreRun(results);
    await store.finish(snapshot.runId, {
      status: 'completed',
      score,
      results,
      durationMs: now() - startedAt,
    });
    log.info(
      {
        ...ids,
        event: 'eval.run.finished',
        recall: score.recall,
        precision: score.precision,
        citation_accuracy: score.citation_accuracy,
        traces_passed: score.traces_passed,
        traces_total: score.traces_total,
        cases_errored: score.cases_errored,
      },
      `eval run finished: ${score.traces_passed}/${score.traces_total} passed`,
    );
    return results;
  }

  private async runCase(
    snapshot: EvalRunSnapshot,
    c: EvalRunnableCase,
    llm: LLMProvider,
    startedAt: number,
  ): Promise<EvalCaseResult> {
    const diff = this.deps.parseDiff(c.inputDiff);
    if (diff.files.length === 0) throw new CaseError('the frozen diff has no files');
    const title = c.meta.pr_title.replace(/\s+/g, ' ').trim().slice(0, TASK_TITLE_MAX_CHARS);
    const budgetMs = this.deps.caseTimeoutMs ?? CASE_TIMEOUT_MS;
    const label = formatBudget(budgetMs);
    const outcome = await withTimeout(
      () => reviewPullRequest({
        systemPrompt: snapshot.systemPrompt,
        model: snapshot.model,
        diff,
        llm: boundedLlm(llm, budgetMs),
        ...(snapshot.strategy ? { strategy: snapshot.strategy } : {}),
        ...(snapshot.skills.length > 0 ? { skills: snapshot.skills } : {}),
        // The PR title is author-controlled: it travels in the untrusted PR block (wrapped by the engine), never in the task line.
        prDescription: `Title: ${title}${c.meta.pr_body ? `\n\n${c.meta.pr_body}` : ''}`,
        task: c.meta.pr_number != null ? `Review PR #${c.meta.pr_number}.` : 'Review the change below.',
        correlationId: this.deps.correlationId,
      }),
      budgetMs,
      label,
    ).catch((err: unknown) => {
      // The SDK's own per-request timeout surfaces as "Request timed out." — same cause, same reason.
      if (err instanceof Error && (err.name === 'APIConnectionTimeoutError' || /timed? ?out/i.test(err.message))) {
        throw new CaseError(`case timed out after ${label}`);
      }
      throw err;
    });
    const scored = scoreCase({
      caseId: c.id,
      caseName: c.name,
      expectation: c.expectation,
      kept: outcome.review.findings,
      dropped: outcome.dropped,
    });
    return { ...scored, cost_usd: outcome.costUsd, duration_ms: this.deps.now() - startedAt };
  }
}

/** A failure whose message is already safe to store and show. */
class CaseError extends Error {}

/** The stable, short reason stored on an errored case; the provider's own text stays in the server log. */
function classifyError(err: unknown): string {
  if (err instanceof CaseError) return err.message;
  const text = errorMessage(err);
  if (/failed schema validation|not valid JSON/i.test(text)) return CASE_ERROR_REASON.invalidOutput;
  return CASE_ERROR_REASON.provider;
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

const formatBudget = (ms: number) => (ms % 1000 === 0 ? `${ms / 1000}s` : `${ms}ms`);

/**
 * The agent call for ONE case must end within the case budget. Promise.race alone only abandons a
 * call that keeps running (and retrying) in the background, so the provider is also told to make a
 * single attempt with the budget as its request timeout: the SDK then aborts the HTTP request itself
 * and neither its own retries nor the structured-output re-prompt loop can outlive the budget.
 * Only this wrapper changes; normal reviews call the provider directly.
 */
function boundedLlm(llm: LLMProvider, budgetMs: number): LLMProvider {
  return {
    id: llm.id,
    listModels: () => llm.listModels(),
    complete: (req) => llm.complete(req),
    embed: (texts) => llm.embed(texts),
    completeStructured: (req) =>
      llm.completeStructured({ ...req, singleAttempt: true, timeoutMs: Math.min(req.timeoutMs ?? budgetMs, budgetMs) }),
  };
}

function withTimeout<T>(start: () => Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CaseError(`case timed out after ${label}`)), ms);
  });
  return Promise.race([start(), timeout]).finally(() => clearTimeout(timer));
}
