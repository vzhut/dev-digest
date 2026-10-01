// get_blast_radius (L04): impact map of a PR from the repo-intel index. Resolves repo/pr,
// primes the PR on the server (getPull — a blast radius read before the PR was ever opened
// can otherwise see a stale/empty diff, server/INSIGHTS.md:57-72), reads /pulls/:id/blast,
// then formats. A degraded/partial index is reported as status:"incomplete" with a resync
// hint — never a bare empty map, which would read as "zero impact" (trap 9).
import { ApiError } from '../api/errors.js';
import type { GetBlastRadiusArgs } from '../contracts.js';
import type { ToolContext, ToolDeps } from '../deps.js';
import { buildBlastResult } from '../format/blast.js';
import { ok, ToolError, toolError, type ToolResult } from '../format/errors.js';

export async function getBlastRadius(deps: ToolDeps, args: GetBlastRadiusArgs, ctx: ToolContext): Promise<ToolResult> {
  const { signal } = ctx;
  const opts = signal ? { signal } : {};
  try {
    const repo = await deps.resolvers.resolveRepo(args.repo, signal);
    const pr = await deps.resolvers.resolvePr(repo, args.pr, signal);
    await deps.api.getPull(pr.id, opts);
    const data = await deps.api.getBlast(pr.id, opts);
    const result = buildBlastResult({ repo: repo.full_name, pr: pr.number, data, limit: args.limit });
    return ok(result as unknown as Record<string, unknown>, 'downstream');
  } catch (err) {
    if (err instanceof ToolError || err instanceof ApiError) return toolError(err.message);
    throw err;
  }
}
