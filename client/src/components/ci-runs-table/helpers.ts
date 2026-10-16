import type { CiRunItem } from "@devdigest/shared";

/** The one label a run row shows: a finished review is judged by its verdict, anything else by its status. */
export type RunResult = "pass" | "fail" | "failed" | "skipped";

export function resultOf(run: Pick<CiRunItem, "status" | "verdict">): RunResult {
  if (run.status === "failed") return "failed";
  if (run.status === "skipped") return "skipped";
  return run.verdict === "fail" ? "fail" : "pass";
}

/** Colour pair per result (the text label always accompanies it: never colour alone). */
export const RESULT_COLOR: Record<RunResult, { color: string; bg: string }> = {
  pass: { color: "var(--ok)", bg: "var(--ok-bg)" },
  fail: { color: "var(--crit)", bg: "var(--crit-bg)" },
  failed: { color: "var(--crit)", bg: "var(--crit-bg)" },
  skipped: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
};

/** Run and PR links come from the server's GitHub data; only https URLs become a link target. */
export function safeHttpsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** True when a severity breakdown is known (the runner always sends it; a run without an artifact has none). */
export function hasBreakdown(run: Pick<CiRunItem, "critical" | "warning" | "suggestion">): boolean {
  return run.critical != null && run.warning != null && run.suggestion != null;
}
