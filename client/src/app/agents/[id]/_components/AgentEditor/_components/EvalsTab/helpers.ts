import type { AgentEvalCase, EvalSuiteRun } from "@devdigest/shared";
import { newestFirst } from "@/lib/eval-runs";

/** "N / M passing": cases whose last result is `passed` over all cases. */
export function passingCount(cases: AgentEvalCase[]): { passed: number; total: number } {
  return { passed: cases.filter((c) => c.last_result === "passed").length, total: cases.length };
}

/** GitHub pull URL for a case's source PR; null unless `repo` is a plain `owner/name`. */
export function sourcePrUrl(meta: { repo?: string | null; pr_number?: number | null }): string | null {
  if (!meta.repo || !/^[\w.-]+\/[\w.-]+$/.test(meta.repo) || !Number.isInteger(meta.pr_number)) return null;
  return `https://github.com/${meta.repo}/pull/${meta.pr_number}`;
}

/** Where a case came from, for its row: "acme/api #482", or null for a case written by hand. */
export function sourceLabel(meta: { repo?: string | null; pr_number?: number | null }): string | null {
  return meta.repo && meta.pr_number != null ? `${meta.repo} #${meta.pr_number}` : null;
}

/** What a row's chip shows: the finding's severity and category, or (no such label) the case type. */
export type CaseChip = { kind: "finding"; severity: string; category: string } | { kind: "type"; type: "must_find" | "must_not_flag" };

export function caseChip(c: AgentEvalCase): CaseChip {
  const label = c.expectation.label;
  if (label?.severity && label.category) return { kind: "finding", severity: label.severity, category: label.category };
  return { kind: "type", type: c.expectation.type };
}

/** Findings the case expects: one for `must_find`, none for `must_not_flag`. */
export const expectedFindings = (c: AgentEvalCase): number => (c.expectation.type === "must_find" ? 1 : 0);

/**
 * The two newest COMPLETED runs, by `ran_at` (never by the order the server happened to return them in): the
 * latest feeds the metric tiles and the previous one their deltas.
 */
export function latestTwoCompleted(runs: EvalSuiteRun[]): { latest: EvalSuiteRun | undefined; previous: EvalSuiteRun | undefined } {
  const completed = newestFirst(runs.filter((r) => r.status === "completed"));
  return { latest: completed[0], previous: completed[1] };
}

/** The newest run that is no longer running (its detail is shown under the history). */
export function latestFinished(runs: EvalSuiteRun[]): EvalSuiteRun | undefined {
  return newestFirst(runs.filter((r) => r.status !== "running"))[0];
}
