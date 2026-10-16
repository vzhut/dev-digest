/**
 * Pure formatting for the multi-agent review surfaces (PR-page picker, Configure run,
 * results header). Estimates are history averages per agent; an agent without history
 * has null numbers and is simply left out of the totals.
 *
 * These functions return the formatted PARTS (duration, cost); the sentences around
 * them live in `messages/en/multiAgent.json` (`format.*`) and are composed by
 * `useMultiAgentFormat` so no user-visible English is hard-coded here.
 */
import type { AgentRunEstimate } from "@devdigest/shared";
import { formatDuration } from "./eval-format";
import { UNKNOWN } from "./format-cost";

export type DurationCost = { duration: string; cost: string };

/** USD: two decimals ("$0.20"), four below a cent ("$0.0096") so a real cost is never hidden; "—" when unknown. */
export function formatCostUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return UNKNOWN;
  if (n > 0 && n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

/** Sum of the known (non-null) numbers; null when there are none. */
export function sumKnown(values: Array<number | null | undefined>): number | null {
  const known = values.filter((v): v is number => v != null && Number.isFinite(v));
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}

/** Per-agent estimate parts, or null when the agent has no history ("no estimate"). */
export function estimateParts(est: AgentRunEstimate | null | undefined): DurationCost | null {
  if (!est || (est.est_duration_ms == null && est.est_cost_usd == null)) return null;
  return { duration: formatDuration(est.est_duration_ms), cost: formatCostUsd(est.est_cost_usd) };
}

/** Selection total: slowest known agent (they run in parallel) and the summed known cost. */
export function selectionTotalParts(estimates: AgentRunEstimate[]): DurationCost {
  const durations = estimates.map((e) => e.est_duration_ms).filter((v): v is number => v != null);
  const max = durations.length === 0 ? null : Math.max(...durations);
  return {
    duration: formatDuration(max),
    cost: formatCostUsd(sumKnown(estimates.map((e) => e.est_cost_usd))),
  };
}

/** Run header parts: wall-clock ("—" while unfinished) and the summed known cost. */
export function runMetaParts(
  totalDurationMs: number | null | undefined,
  costs: Array<number | null | undefined>,
): { wall: string; cost: string } {
  return {
    wall: totalDurationMs == null ? UNKNOWN : formatDuration(totalDurationMs),
    cost: formatCostUsd(sumKnown(costs)),
  };
}
