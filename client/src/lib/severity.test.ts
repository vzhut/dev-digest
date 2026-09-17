import { describe, it, expect } from "vitest";
import type { Severity } from "@devdigest/shared";
import { severityCounts } from "./severity";

const finding = (id: string, severity: Severity) => ({ id, severity });

describe("severityCounts", () => {
  it("groups by severity in CRITICAL → WARNING → SUGGESTION order", () => {
    const findings = [
      finding("s1", "SUGGESTION"),
      finding("w1", "WARNING"),
      finding("c1", "CRITICAL"),
      finding("w2", "WARNING"),
    ];
    expect(severityCounts(findings)).toEqual([
      { severity: "CRITICAL", count: 1 },
      { severity: "WARNING", count: 2 },
      { severity: "SUGGESTION", count: 1 },
    ]);
  });

  it("omits severities with no findings", () => {
    expect(severityCounts([finding("w1", "WARNING")])).toEqual([{ severity: "WARNING", count: 1 }]);
  });

  it("returns nothing for no findings", () => {
    expect(severityCounts([])).toEqual([]);
  });
});
