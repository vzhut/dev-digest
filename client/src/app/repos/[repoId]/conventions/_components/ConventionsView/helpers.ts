import type { ConventionCandidate, ConventionScan } from "@devdigest/shared";
import { DROP_REASON_KEYS } from "./constants";

/** Toolbar's "X of N accepted" (§5) — N is every candidate on the page, not
 * just pending ones, so accepting/rejecting never changes the denominator. */
export function acceptedSummary(candidates: ConventionCandidate[]): { accepted: number; total: number } {
  return { accepted: candidates.filter((c) => c.status === "accepted").length, total: candidates.length };
}

/** Non-zero drop reasons from the latest scan, in the verifier's own check
 * order — the raw material for the quality line and for §9/§10's report. */
export function dropReasonEntries(scan: ConventionScan | null): { key: string; count: number }[] {
  if (!scan) return [];
  return DROP_REASON_KEYS.map((key) => ({ key, count: scan.dropped[key] ?? 0 })).filter((e) => e.count > 0);
}

/** Total dropped across every reason — the "Z dropped" half of the quality line. */
export function totalDropped(scan: ConventionScan | null): number {
  return dropReasonEntries(scan).reduce((sum, e) => sum + e.count, 0);
}
