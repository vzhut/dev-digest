import { describe, it, expect } from "vitest";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { filterBySeverity } from "./helpers";

function finding(id: string, severity: Severity): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: id,
    file: "a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

describe("filterBySeverity", () => {
  const findings = [finding("c1", "CRITICAL"), finding("w1", "WARNING")];

  it("keeps only the chosen severity", () => {
    expect(filterBySeverity(findings, "WARNING").map((f) => f.id)).toEqual(["w1"]);
  });

  it("returns the full list when no severity is chosen", () => {
    expect(filterBySeverity(findings, null)).toBe(findings);
  });
});
