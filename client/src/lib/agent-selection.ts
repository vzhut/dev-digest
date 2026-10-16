/* Pure selection helpers shared by the PR-page picker and the Configure run form. */
import type { Agent, AgentRunEstimate } from "@devdigest/shared";

export function enabledAgents(agents: Agent[] | undefined): Agent[] {
  return (agents ?? []).filter((a) => a.enabled);
}

export function toggleId(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Estimate rows of the checked agents (agents without a row simply contribute nothing). */
export function estimatesFor(ids: string[], estimates: AgentRunEstimate[] | undefined): AgentRunEstimate[] {
  const wanted = new Set(ids);
  return (estimates ?? []).filter((e) => wanted.has(e.agent_id));
}
