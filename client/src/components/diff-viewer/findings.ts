/* Inline-finding support for the DiffViewer (Files changed tab).
   The viewer never imports app code: the route injects a `FindingView`
   component and the findings already grouped by file. */
import type React from "react";
import type { FindingRecord } from "@devdigest/shared";
import { lineKey } from "./comments";

/** What the viewer needs to show a review's findings inline. */
export interface DiffFindingApi {
  /** Latest-review findings keyed by file path. */
  byFile: Record<string, FindingRecord[]>;
  /** Shared with the comments toggle: false hides the cards (dots stay). */
  show: boolean;
  /** Renders one finding card (route-local, owns accept/dismiss). */
  FindingView: React.ComponentType<{ finding: FindingRecord }>;
}

/** Severity → `prReview.smartDiff.severity.<key>`; INFO has no label. */
export const SEVERITY_LABEL_KEY: Record<string, string | undefined> = {
  CRITICAL: "smartDiff.severity.blocker",
  WARNING: "smartDiff.severity.warning",
  SUGGESTION: "smartDiff.severity.suggestion",
};

/** Most severe first; unknown severities sort last. */
const SEVERITY_ORDER = ["CRITICAL", "WARNING", "SUGGESTION", "INFO"];

/** The line key a finding anchors on (its start line, new-file side). */
export function findingKey(f: FindingRecord): string | null {
  return lineKey("RIGHT", f.start_line);
}

/** Split findings into ones that match a rendered line and the rest. */
export function partitionFindings(
  findings: FindingRecord[],
  renderedKeys: Set<string>,
): { matched: Map<string, FindingRecord[]>; outside: FindingRecord[] } {
  const matched = new Map<string, FindingRecord[]>();
  const outside: FindingRecord[] = [];
  for (const f of findings) {
    const key = findingKey(f);
    if (key && renderedKeys.has(key)) {
      matched.set(key, [...(matched.get(key) ?? []), f]);
    } else {
      outside.push(f);
    }
  }
  return { matched, outside };
}

/** Severity of the most severe finding in a non-empty list. */
export function topSeverity(findings: FindingRecord[]): string {
  const rank = (sev: string) => {
    const i = SEVERITY_ORDER.indexOf(sev);
    return i === -1 ? SEVERITY_ORDER.length : i;
  };
  return findings.reduce((best, f) => (rank(f.severity) < rank(best) ? f.severity : best), findings[0]!.severity);
}
