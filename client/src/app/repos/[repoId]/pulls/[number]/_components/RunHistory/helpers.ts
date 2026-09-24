import type { IconName } from "@devdigest/ui";
import type { RunSummary, PrCommit } from "@devdigest/shared";

/** Badge for a run: i18n key under `runStatus`, colours and icon. */
export type Outcome = { key: string; color: string; bg: string; icon: IconName };

/**
 * The review OUTCOME, not just the run lifecycle: a finished run that found
 * blockers reads "rejected" (red), never a green "done". Derived from the
 * denormalized blocker/finding counts on the run row, so it matches the CI gate
 * (deterministic) rather than the model's verdict.
 */
export function outcomeOf(run: RunSummary): Outcome {
  const status = run.status ?? "";
  if (status === "running")
    return { key: "running", color: "var(--accent)", bg: "var(--accent-bg)", icon: "RefreshCw" };
  if (status === "failed") return { key: "error", color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" };
  if (status === "cancelled")
    return { key: "cancelled", color: "var(--text-muted)", bg: "var(--bg-hover)", icon: "X" };
  // Settled ("done"): color by the deterministic outcome.
  if ((run.blockers ?? 0) > 0) return { key: "rejected", color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" };
  if ((run.findings_count ?? 0) > 0)
    return { key: "reviewed", color: "var(--warn)", bg: "var(--warn-bg)", icon: "MessageSquare" };
  return { key: "approved", color: "var(--ok)", bg: "var(--ok-bg)", icon: "CheckCircle" };
}

/** Epoch ms for sorting; unparseable / missing timestamps sort last. */
export function tsOf(s: string | null | undefined): number {
  if (!s) return 0;
  const n = Date.parse(s);
  return Number.isNaN(n) ? 0 : n;
}

export type TimelineItem = { kind: "run"; ts: number; run: RunSummary } | { kind: "commit"; ts: number; commit: PrCommit };

/** Runs and commits interleaved, newest first. */
export function timelineItems(runs: RunSummary[], commits: PrCommit[]): TimelineItem[] {
  return [
    ...runs.map((run) => ({ kind: "run" as const, ts: tsOf(run.ran_at), run })),
    ...commits.map((commit) => ({ kind: "commit" as const, ts: tsOf(commit.committed_at), commit })),
  ].sort((a, b) => b.ts - a.ts);
}
