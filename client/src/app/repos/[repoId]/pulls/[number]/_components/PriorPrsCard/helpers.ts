import type { PrHistoryItem } from "@devdigest/shared";
import { githubPrUrl } from "@/lib/github-urls";

/**
 * GitHub PR link for a prior-PR row, or `null` while the repo hasn't loaded
 * yet (`repoFullName` is `null` until then — PrDetailView.tsx). The card
 * renders `#number title` as plain text instead of a link in that case.
 */
export function priorPrHref(repoFullName: string | null, prNumber: number): string | null {
  if (!repoFullName) return null;
  return githubPrUrl(repoFullName, prNumber);
}

/** The `#number title` label shown for a prior-PR row, GitHub text only — never HTML. */
export function priorPrLabel(item: Pick<PrHistoryItem, "pr_number" | "title">): string {
  return `#${item.pr_number} ${item.title}`;
}
