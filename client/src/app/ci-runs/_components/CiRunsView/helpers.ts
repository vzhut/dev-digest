import type { CiRunItem } from "@devdigest/shared";

export interface RunFilters {
  /** "" = every agent. */
  agentId: string;
  /** "" = every repository. */
  repo: string;
}

export const NO_FILTERS: RunFilters = { agentId: "", repo: "" };

/** Newest first, by the time the run finished; the input is not mutated. */
export function newestFirst(runs: readonly CiRunItem[]): CiRunItem[] {
  return [...runs].sort((a, b) => Date.parse(b.ran_at) - Date.parse(a.ran_at));
}

export function filterRuns(runs: readonly CiRunItem[], filters: RunFilters): CiRunItem[] {
  return runs.filter(
    (r) => (!filters.agentId || r.agent_id === filters.agentId) && (!filters.repo || r.repo === filters.repo),
  );
}

/** Distinct agents in the data (a deleted agent has no id and is reachable through "all agents" only). */
export function agentOptions(runs: readonly CiRunItem[]): { value: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const r of runs) if (r.agent_id && !seen.has(r.agent_id)) seen.set(r.agent_id, r.agent_name);
  return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

export function repoOptions(runs: readonly CiRunItem[]): { value: string; label: string }[] {
  return [...new Set(runs.map((r) => r.repo))].sort().map((repo) => ({ value: repo, label: repo }));
}
