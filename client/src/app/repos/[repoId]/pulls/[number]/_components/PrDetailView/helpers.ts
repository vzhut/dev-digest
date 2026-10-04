import type { ReviewRecord } from "@devdigest/shared";
import type { DiffTarget } from "@/components/diff-viewer";
import { withSearchParam } from "@/lib/search-params";
import type { PrBriefLatestReview } from "../PrBriefCard";

/** Deep-link target from `?file=&line=`; null unless both are present and the line is a positive integer. */
export function parseDiffTarget(file: string | null, line: string | null): DiffTarget | null {
  if (!file || !line || !/^\d+$/.test(line)) return null;
  const n = Number(line);
  return n > 0 ? { file, line: n } : null;
}

/** The query string that opens `file:line` in the Files changed tab (other params kept). */
export function diffDeepLinkQuery(current: string, file: string, line: number): string {
  let qs = withSearchParam(current, "tab", "diff");
  qs = withSearchParam(qs, "file", file);
  return withSearchParam(qs, "line", String(line));
}

/** Verdict data of the newest review (reviews come newest-first); null when there is none or it has no verdict. */
export function latestReviewSummary(reviews: ReviewRecord[]): PrBriefLatestReview | null {
  const r = reviews.find((x) => x.kind === "review");
  if (!r || !r.verdict) return null;
  const live = r.findings.filter((f) => !f.dismissed_at);
  return {
    verdict: r.verdict,
    score: r.score,
    findingsCount: r.findings.length,
    blockers: live.filter((f) => f.severity === "CRITICAL").length,
    agentName: r.agent_name ?? null,
  };
}
