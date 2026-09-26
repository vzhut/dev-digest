// get_conventions: the repo's extracted conventions (accepted by default). Read-only —
// extraction is a paid LLM job and is never triggered from here.
import { ApiError } from '../api/errors.js';
import type { GetConventionsArgs } from '../contracts.js';
import type { ToolContext, ToolDeps } from '../deps.js';
import { ToolError, ok, toolError, type ToolResult } from '../format/errors.js';
import { buildConventionsResult } from '../format/conventions.js';

export async function getConventions(deps: ToolDeps, args: GetConventionsArgs, ctx: ToolContext): Promise<ToolResult> {
  try {
    const signal = ctx.signal;
    const repo = await deps.resolvers.resolveRepo(args.repo, signal);
    const data = await deps.api.getConventions(repo.id, signal ? { signal } : {});
    const result = buildConventionsResult({
      repo: repo.full_name,
      scan: data.scan,
      candidates: data.candidates,
      status: args.status,
      limit: args.limit,
      format: args.response_format,
    });
    return ok(result as unknown as Record<string, unknown>, 'conventions');
  } catch (err) {
    if (err instanceof ToolError || err instanceof ApiError) return toolError(err.message);
    throw err;
  }
}
