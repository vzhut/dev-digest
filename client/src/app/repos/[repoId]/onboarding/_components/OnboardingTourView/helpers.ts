import type { OnboardingTourResponse, Tour, TourIndexInfo, TourUsage } from "@devdigest/shared";
import { formatCostUsd, formatTokensTotal } from "@/lib/format-cost";
import { SECTION_IDS } from "../TourSections";
import type { SectionId } from "../TourSections";

export type PageMode = "not_cloned" | "empty" | "tour";

/** Which screen to show for a loaded response. `generating` without a stored tour reads as "empty". */
export function pageMode(data: OnboardingTourResponse): PageMode {
  if (data.status === "not_cloned") return "not_cloned";
  return data.tour ? "tour" : "empty";
}

/** The code moved on since the tour was generated (AC-30). */
export function isStale(tour: Tour, indexSha: string | null | undefined): boolean {
  return !!indexSha && indexSha !== tour.source_sha;
}

export type UsageParts =
  | { calls: 0 }
  | { calls: 1; tokens: string | null; cost: string };

/** D3: no LLM call → just "0 LLM calls" (formatTokensTotal(0, 0) would print "0 tok"). Unknown cost → "—". */
export function usageParts(usage: TourUsage): UsageParts {
  if (usage.llm_calls === 0) return { calls: 0 };
  return {
    calls: 1,
    tokens: formatTokensTotal(usage.tokens_in, usage.tokens_out),
    cost: formatCostUsd(usage.cost_usd),
  };
}

export type Coverage =
  | { kind: "all"; n: number }
  | { kind: "bounded"; n: number; m: number }
  | { kind: "unknown"; n: number };

/** D6 (revised by F4): "N of M" only when M is known; an unknown M is never guessed. */
export function coverageOf(index: TourIndexInfo): Coverage {
  const n = index.files_indexed;
  if (index.files_total == null) return { kind: "unknown", n };
  if (index.bounded || index.files_total > n) return { kind: "bounded", n, m: index.files_total };
  return { kind: "all", n };
}

/** Skipped-file count when the index was partial, otherwise null (AC-22). */
export function partialSkipped(index: TourIndexInfo): number | null {
  return index.status === "partial" ? index.files_skipped : null;
}

/** `acme/payments-api` → `payments-api`. */
export function repoShortName(fullName: string): string {
  const i = fullName.indexOf("/");
  return i >= 0 ? fullName.slice(i + 1) : fullName;
}

/** AC-36: the page's own URL, current fragment included; nothing else is added. */
export function shareUrl(loc: { origin: string; pathname: string; hash: string }): string {
  return `${loc.origin}${loc.pathname}${loc.hash}`;
}

export function isSectionId(id: string): id is SectionId {
  return (SECTION_IDS as readonly string[]).includes(id);
}
