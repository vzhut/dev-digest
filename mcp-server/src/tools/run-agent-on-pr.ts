// run_agent_on_pr — the one paid, write tool. Resolves the flat args, primes the PR diff,
// starts (or reuses) exactly one run, waits for it and returns the finished findings.
// The handler is registered by tools/index.ts (T8); the description text lives there.
import { ApiRateLimitError } from '../api/errors.js';
import type { RunSummary } from '../api/schemas.js';
import type { RunAgentOnPrArgs, RunningResult } from '../contracts.js';
import type { ToolContext, ToolDeps } from '../deps.js';
import { ok, toolError, type ToolResult } from '../format/errors.js';
import { buildFindingsResult, pickReview } from '../format/findings.js';
import { cancelledMessage, failedMessage, retryHint } from '../format/messages.js';
import { sanitizeText } from '../format/sanitize.js';

/**
 * Stop waiting this long before the 120 s ceiling: Claude Code auto-backgrounds MCP calls
 * at 120 s (Unverified), so the tool must answer first (spec D5).
 */
export const WAIT_SAFETY_MAX_SECONDS = 115;
const CONCISE_LIMIT = 20;

export async function runAgentOnPr(deps: ToolDeps, args: RunAgentOnPrArgs, ctx: ToolContext): Promise<ToolResult> {
  const { signal } = ctx;
  const repo = await deps.resolvers.resolveRepo(args.repo, signal);
  const pr = await deps.resolvers.resolvePr(repo, args.pr, signal);
  const agent = await deps.resolvers.resolveAgent(args.agent, { requireEnabled: true }, signal);

  const guard = deps.runGuard;
  const key = `${pr.id}:${agent.id}`;
  const running = guard.inFlight.get(key);
  if (running) return running; // identical concurrent call: share the one run

  const call = execute();
  guard.inFlight.set(key, call);
  try {
    return await call;
  } finally {
    guard.inFlight.delete(key);
  }

  async function execute(): Promise<ToolResult> {
    // A review started before the PR detail was opened sees an EMPTY diff and "approves".
    await deps.api.getPull(pr.id, { signal });

    let runId: string;
    let reused = false;
    const active = (await deps.api.activeRuns(pr.id, { signal })).find((r) => r.agent_id === agent.id);
    if (active) {
      runId = active.run_id;
      reused = true;
    } else {
      const gate = guard.limiter.tryAcquire();
      if (!gate.ok) return toolError(rateLimitMessage(deps, gate.retryAfterSec));
      try {
        const started = await deps.api.startReview(pr.id, agent.id, { signal });
        const created = started.runs.find((r) => r.agent_id === agent.id) ?? started.runs[0];
        if (!created) return toolError(`DevDigest started no run for '${sanitizeText(agent.name, 80)}'. Check the agent in DevDigest → Agents, then call run_agent_on_pr again.`);
        runId = created.run_id;
      } catch (err) {
        if (err instanceof ApiRateLimitError) return toolError(rateLimitMessage(deps, err.retryAfterSec ?? 60));
        throw err;
      }
    }

    const running = (): ToolResult =>
      ok({
        status: 'running',
        run_id: runId,
        repo: repo.full_name,
        pr: pr.number,
        agent: sanitizeText(agent.name, 80),
        next: retryHint(runId),
      } satisfies RunningResult);

    // ---- wait for a terminal state ----
    const waitSeconds = Math.min(args.wait_seconds, WAIT_SAFETY_MAX_SECONDS);
    const limitMs = waitSeconds * 1000;
    const startedAt = deps.now();
    let lastProgress = 0;
    let run: RunSummary | undefined;

    for (;;) {
      if (signal?.aborted) return running(); // client stopped waiting; the paid run keeps going
      try {
        run = (await deps.api.listRuns(pr.id, { signal })).find((r) => r.run_id === runId);
      } catch (err) {
        if (signal?.aborted) return running();
        throw err;
      }
      if (run && run.status && run.status !== 'running') break;

      const elapsedMs = deps.now() - startedAt;
      if (elapsedMs >= limitMs) return running();
      lastProgress = Math.max(lastProgress + 1, Math.round(elapsedMs / 1000));
      await ctx.progress({ progress: lastProgress, total: args.wait_seconds, message: `review running (${Math.round(elapsedMs / 1000)}s)` });

      try {
        await deps.sleep(Math.min(deps.config.pollMs, limitMs - elapsedMs), signal);
      } catch (err) {
        if (signal?.aborted) return running();
        throw err;
      }
    }

    if (run.status === 'failed') return toolError(failedMessage(runId, run.error));
    if (run.status === 'cancelled') return toolError(cancelledMessage(runId));

    const reviews = await deps.api.listReviews(pr.id, { signal });
    const picked = pickReview(reviews, [run], { runId });
    if (picked.state !== 'done') return running(); // review not visible yet: get_findings will have it shortly
    const result = buildFindingsResult({
      repo: repo.full_name,
      pr: pr.number,
      review: picked.review,
      run,
      severityMin: 'SUGGESTION',
      limit: CONCISE_LIMIT,
      format: 'concise',
    });
    if (reused) result.reused_run = true;
    return ok({ ...result }, 'findings');
  }
}

function rateLimitMessage(deps: ToolDeps, waitSec: number): string {
  const minutes = Math.round(deps.config.runWindowMs / 60_000);
  return `Run limit reached (${deps.config.runLimit} per ${minutes} min). Wait ${waitSec} s or use get_findings on an existing run.`;
}
