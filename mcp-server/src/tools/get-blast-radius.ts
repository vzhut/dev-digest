// get_blast_radius: STUB. Resolves repo/pr so argument errors lead onward like the other
// tools, then always answers with an error — never an empty result, which would read as
// "zero impact".
//
// TODO(L04 homework): compute the impact map from the `repo-intel` facade behind a new
// server endpoint and return `BlastRadiusResult` (src/contracts.ts, mirrors the shared
// `BlastRadius`, server/src/vendor/shared/contracts/brief.ts:48-76).
import { ApiError } from '../api/errors.js';
import type { GetBlastRadiusArgs } from '../contracts.js';
import type { ToolContext, ToolDeps } from '../deps.js';
import { ToolError, toolError, type ToolResult } from '../format/errors.js';

export const NOT_IMPLEMENTED_MESSAGE =
  'get_blast_radius is not implemented yet (DevDigest L04 homework). No impact data exists — do not read this as zero impact. Use get_findings for review results.';

export async function getBlastRadius(deps: ToolDeps, args: GetBlastRadiusArgs, ctx: ToolContext): Promise<ToolResult> {
  try {
    const repo = await deps.resolvers.resolveRepo(args.repo, ctx.signal);
    await deps.resolvers.resolvePr(repo, args.pr, ctx.signal);
    return toolError(NOT_IMPLEMENTED_MESSAGE);
  } catch (err) {
    if (err instanceof ToolError || err instanceof ApiError) return toolError(err.message);
    throw err;
  }
}
