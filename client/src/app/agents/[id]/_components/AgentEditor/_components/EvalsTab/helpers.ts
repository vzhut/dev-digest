import type { AgentEvalCase } from "@devdigest/shared";

/** "N / M passing": cases whose last result is `passed` over all cases. */
export function passingCount(cases: AgentEvalCase[]): { passed: number; total: number } {
  return { passed: cases.filter((c) => c.last_result === "passed").length, total: cases.length };
}

/** GitHub pull URL for a case's source PR; null unless `repo` is a plain `owner/name`. */
export function sourcePrUrl(meta: { repo: string; pr_number: number }): string | null {
  if (!/^[\w.-]+\/[\w.-]+$/.test(meta.repo) || !Number.isInteger(meta.pr_number)) return null;
  return `https://github.com/${meta.repo}/pull/${meta.pr_number}`;
}
