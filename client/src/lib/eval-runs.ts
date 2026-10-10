import type { EvalSuiteRun } from "@devdigest/shared";

/** Newest first by `ran_at`, whatever order the server (or a test) hands the runs over in. */
export function newestFirst(runs: EvalSuiteRun[]): EvalSuiteRun[] {
  return [...runs].sort((a, b) => Date.parse(b.ran_at) - Date.parse(a.ran_at));
}
