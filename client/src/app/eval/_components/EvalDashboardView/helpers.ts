import type { EvalRecentRun, RunAllEvalResponse } from "@devdigest/shared";

/** "Name, Name" for the agent ids of a run-all report (an unknown id falls back to the id itself). */
export function agentNames(ids: string[], nameOf: Map<string, string>): string {
  return ids.map((id) => nameOf.get(id) ?? id).join(", ");
}

/** Skipped agents as "Name (reason)", the reason localised by the caller. */
export function skippedItems(
  skipped: RunAllEvalResponse["skipped"],
  nameOf: Map<string, string>,
  reasonLabel: (code: string) => string,
): string {
  return skipped.map((x) => `${nameOf.get(x.agent_id) ?? x.agent_id} (${reasonLabel(x.reason)})`).join(", ");
}

/** Newest first by `ran_at`, whatever order the server returns. */
export function recentFirst(runs: EvalRecentRun[]): EvalRecentRun[] {
  return [...runs].sort((a, b) => Date.parse(b.ran_at) - Date.parse(a.ran_at));
}
