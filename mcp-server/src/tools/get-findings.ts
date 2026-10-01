// get_findings: read the verdict + findings of an already finished review of a PR. Free (no LLM).
// Selection: run_id → that run; else latest run of `agent`; else latest run overall (+ hint naming
// the other agents that reviewed it). Runs and reviews are joined on run_id by pickReview.
// Resolver failures (ToolError / Api*Error) propagate: the registry (T8) turns them into isError.
import type { GetFindingsArgs } from '../contracts.js';
import type { ToolContext, ToolDeps } from '../deps.js';
import { ok, toolError, type ToolResult } from '../format/errors.js';
import { buildFindingsResult, pickReview } from '../format/findings.js';
import { cancelledMessage, failedMessage, retryHint } from '../format/messages.js';
import { sanitizeText } from '../format/sanitize.js';

const AGENT_NAME_MAX = 80;

export async function getFindings(deps: ToolDeps, args: GetFindingsArgs, ctx: ToolContext): Promise<ToolResult> {
  const { signal } = ctx;
  const repo = await deps.resolvers.resolveRepo(args.repo, signal);
  const pr = await deps.resolvers.resolvePr(repo, args.pr, signal);
  // Disabled agents are fine for reading: their past runs stay readable.
  const agent = args.agent ? await deps.resolvers.resolveAgent(args.agent, {}, signal) : undefined;

  const [runs, reviews] = await Promise.all([deps.api.listRuns(pr.id, { signal }), deps.api.listReviews(pr.id, { signal })]);
  const picked = pickReview(reviews, runs, { runId: args.run_id, agentId: agent?.id });

  switch (picked.state) {
    case 'no_run': {
      const who = agent ? ` by ${sanitizeText(agent.name, AGENT_NAME_MAX)}` : '';
      return ok({ status: 'no_run', repo: repo.full_name, pr: pr.number, hint: `no review${who} for PR #${pr.number} yet — call run_agent_on_pr` });
    }

    case 'unknown_run':
      return toolError(`Run ${sanitizeText(args.run_id ?? '', 60)} is not on PR #${pr.number} — omit run_id to get the latest.`);

    case 'running':
      const retry = retryHint(picked.run.run_id);
      return ok({
        status: 'running',
        repo: repo.full_name,
        pr: pr.number,
        agent: picked.run.agent_name ? sanitizeText(picked.run.agent_name, AGENT_NAME_MAX) : undefined,
        run_id: picked.run.run_id,
        hint: picked.alsoReviewedBy.length > 0 ? `${retry}; also reviewed by: ${picked.alsoReviewedBy.join(', ')} — pass agent` : retry,
      });

    case 'failed':
      return toolError(failedMessage(picked.run.run_id, picked.run.error));

    case 'cancelled':
      return toolError(cancelledMessage(picked.run.run_id));

    case 'done':
      return ok(
        {
          ...buildFindingsResult({
            repo: repo.full_name,
            pr: pr.number,
            review: picked.review,
            run: picked.run,
            severityMin: args.severity_min,
            limit: args.limit,
            format: args.response_format,
            alsoReviewedBy: picked.alsoReviewedBy,
          }),
        },
        'findings',
      );
  }
}
