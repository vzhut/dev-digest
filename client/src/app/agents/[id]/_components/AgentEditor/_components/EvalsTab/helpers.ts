import type { AgentEvalCase } from "@devdigest/shared";

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
