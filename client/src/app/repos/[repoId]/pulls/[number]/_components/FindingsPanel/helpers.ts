import type { FindingRecord, Severity } from "@devdigest/shared";
import { SEVERITY_RANK } from "@/lib/severity";
import { LOW_CONFIDENCE_THRESHOLD } from "./constants";

/** Optionally drop low-confidence findings and sort by severity. */
export function visibleFindings(findings: FindingRecord[], hideLow: boolean): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  return [...shown].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
}

/** Keep only one severity; `null` means no filter. */
export function filterBySeverity(
  findings: FindingRecord[],
  severity: Severity | null,
): FindingRecord[] {
  return severity ? findings.filter((f) => f.severity === severity) : findings;
}
