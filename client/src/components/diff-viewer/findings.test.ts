import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { partitionFindings, topSeverity } from "./findings";

const f = (id: string, severity: string, start_line: number): FindingRecord =>
  ({ id, severity, start_line, end_line: start_line, file: "a.ts" }) as FindingRecord;

describe("diff-viewer findings helpers", () => {
  it("anchors findings on RIGHT:start_line and sends the rest outside", () => {
    const { matched, outside } = partitionFindings(
      [f("1", "WARNING", 3), f("2", "INFO", 3), f("3", "CRITICAL", 99)],
      new Set(["RIGHT:3", "LEFT:2"]),
    );
    expect(matched.get("RIGHT:3")?.map((x) => x.id)).toEqual(["1", "2"]);
    expect(outside.map((x) => x.id)).toEqual(["3"]);
  });

  it("picks the most severe severity", () => {
    expect(topSeverity([f("1", "SUGGESTION", 1), f("2", "CRITICAL", 1), f("3", "WARNING", 1)])).toBe("CRITICAL");
    expect(topSeverity([f("1", "INFO", 1), f("2", "SUGGESTION", 1)])).toBe("SUGGESTION");
  });
});
