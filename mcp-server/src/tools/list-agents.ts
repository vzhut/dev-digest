// list_agents: enabled reviewer agents, in the shape run_agent_on_pr accepts.
// The API parser (api/schemas.ts) never keeps `system_prompt` / `output_schema`, and this
// mapper whitelists fields again, so a prompt cannot leak into the output.
import { ApiError } from '../api/errors.js';
import type { ListAgentsArgs, ListAgentsResult } from '../contracts.js';
import type { ToolContext, ToolDeps } from '../deps.js';
import { ToolError, ok, toolError, type ToolResult } from '../format/errors.js';
import { sanitizeText } from '../format/sanitize.js';

const ABOUT_MAX = 120;
const NAME_MAX = 100;
const EMPTY_HINT = 'no enabled agents — enable or create one in DevDigest → Agents';

export async function listAgents(deps: ToolDeps, _args: ListAgentsArgs, ctx: ToolContext): Promise<ToolResult> {
  try {
    const all = await deps.api.listAgents(ctx.signal ? { signal: ctx.signal } : {});
    const agents = all
      .filter((a) => a.enabled)
      .map((a) => {
        const about = sanitizeText(a.description ?? '', ABOUT_MAX);
        return {
          name: sanitizeText(a.name, NAME_MAX),
          id: a.id,
          model: `${a.provider}/${a.model}`,
          ...(about ? { about } : {}),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    const result: ListAgentsResult = agents.length > 0 ? { agents } : { agents, hint: EMPTY_HINT };
    return ok(result as unknown as Record<string, unknown>, 'agents');
  } catch (err) {
    if (err instanceof ToolError || err instanceof ApiError) return toolError(err.message);
    throw err;
  }
}
