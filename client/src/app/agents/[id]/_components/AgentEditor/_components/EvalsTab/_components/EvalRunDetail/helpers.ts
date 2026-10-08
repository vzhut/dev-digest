import type { EvalCaseResult, EvalOutcomeLabel, EvalProducedFinding } from "@devdigest/shared";

export interface ProducedRow {
  finding: EvalProducedFinding;
  label: Extract<EvalOutcomeLabel, "matched" | "noise" | "unlabeled">;
}

/** Each kept finding labelled: noise (hit a must_not_flag), matched (hit a must_find) or unlabeled. */
export function producedRows(result: EvalCaseResult): ProducedRow[] {
  const noise = new Set(result.noise);
  const unlabeled = new Set(result.unlabeled);
  return result.produced.map((finding, i) => ({
    finding,
    label: noise.has(i) ? "noise" : unlabeled.has(i) ? "unlabeled" : "matched",
  }));
}

/** Whether a `must_find` expectation was matched or missed; null for `must_not_flag` (its hits show as noise). */
export function expectationLabel(
  type: string,
  matchedBy: number[],
): Extract<EvalOutcomeLabel, "matched" | "missed"> | null {
  if (type !== "must_find") return null;
  return matchedBy.length > 0 ? "matched" : "missed";
}

/** The reason shared by every errored case, when there is exactly one (a provider failure) — shown once. */
export function sharedErrorReason(results: EvalCaseResult[]): string | null {
  const reasons = new Set(results.filter((r) => r.status === "error").map((r) => r.error ?? ""));
  return reasons.size === 1 ? [...reasons][0]! || null : null;
}
