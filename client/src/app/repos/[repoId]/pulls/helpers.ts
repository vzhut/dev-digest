import { OPEN_STATUSES, SIZE_MEDIUM_MAX, SIZE_SMALL_MAX, type PrMeta, type SizeInfo } from "./constants";

/** Bucket a PR into S/M/L by total changed lines. */
export function sizeOf(pr: PrMeta): SizeInfo {
  const lines = pr.additions + pr.deletions;
  const size = lines < SIZE_SMALL_MAX ? "S" : lines < SIZE_MEDIUM_MAX ? "M" : "L";
  return { size, lines };
}

/** The rows the list shows: status filter ("all" = none), title/number search, then updated_at sort. */
export function filterPulls(
  pulls: PrMeta[],
  { status, query, sort }: { status: string; query: string; sort: string },
): PrMeta[] {
  const q = query.trim().toLowerCase();
  return pulls
    .filter((p) => status === "all" || p.status === status)
    .filter((p) => !q || p.title.toLowerCase().includes(q) || String(p.number).includes(q))
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(a.updated_at ?? "") || 0;
      const tb = Date.parse(b.updated_at ?? "") || 0;
      return sort === "oldest" ? ta - tb : tb - ta;
    });
}

/** Header counts: open PRs (any open review status) and the ones still needing review. */
export function pullCounts(pulls: PrMeta[]): { open: number; needsReview: number } {
  return {
    open: pulls.filter((p) => OPEN_STATUSES.has(p.status)).length,
    needsReview: pulls.filter((p) => p.status === "needs_review").length,
  };
}
