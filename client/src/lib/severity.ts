import type { Severity } from "@devdigest/shared";

/** Display order: lower rank is shown first. */
export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};

export type SeverityCount = { severity: Severity; count: number };

/**
 * Group findings by severity — CRITICAL → WARNING → SUGGESTION, zero counts
 * omitted. Pure grouping over findings already on the page (no request, no
 * LLM). Shared by the Review runs pills and the findings popover, so both
 * surfaces always agree on the numbers.
 */
export function severityCounts(findings: { severity: Severity }[]): SeverityCount[] {
  const bySeverity = new Map<Severity, number>();
  for (const f of findings) bySeverity.set(f.severity, (bySeverity.get(f.severity) ?? 0) + 1);
  return [...bySeverity]
    .map(([severity, count]) => ({ severity, count }))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
