/* Pure rules for the multi-agent results page. */
import type { RunColumn, RunConflict, RunTake } from "./types";

export type DisplayStatus = "queued" | "running" | "done" | "failed" | "cancelled";

/** A running child shows "queued" until its first live event arrives, then "running". */
export function displayStatus(status: RunColumn["status"], hasEvents: boolean): DisplayStatus {
  if (status === "queued" || status === "running") return hasEvents ? "running" : "queued";
  return status;
}

export function isLive(status: RunColumn["status"]): boolean {
  return status === "queued" || status === "running";
}

/** Milliseconds from the parent's start to `now`, never negative. */
export function elapsedMs(ranAt: string, now: number): number {
  const start = new Date(ranAt).getTime();
  return Number.isNaN(start) ? 0 : Math.max(0, now - start);
}

/** The "Show only conflicts" filter: keep entries the server marked `is_conflict`. */
export function visibleConflicts(conflicts: RunConflict[], onlyConflicts: boolean): RunConflict[] {
  return onlyConflicts ? conflicts.filter((c) => c.is_conflict) : conflicts;
}

export type TakeKind = "flagged" | "ignored" | "failed" | "cancelled" | "pending";

export function takeKind(take: RunTake): TakeKind {
  const v = take.verdict;
  return v === "ignored" || v === "failed" || v === "cancelled" || v === "pending" ? v : "flagged";
}

export function lineRange(start: number, end: number): string {
  return end > start ? `${start}-${end}` : `${start}`;
}

/** Score colour: >= 70 ok, >= 50 warn, else crit; muted when there is no score. */
export function scoreColor(score: number | null | undefined): string {
  if (score == null) return "var(--text-muted)";
  return score >= 70 ? "var(--ok)" : score >= 50 ? "var(--warn)" : "var(--crit)";
}
