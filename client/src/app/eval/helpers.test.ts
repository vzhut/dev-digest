import { describe, it, expect } from "vitest";
import { passRate, sparklinePoints } from "./helpers";

describe("sparkline helpers", () => {
  it("needs two real points, skips nulls and keeps values inside the box", () => {
    expect(sparklinePoints([0.5], 90, 28)).toBeNull();
    expect(sparklinePoints([null, 1, null], 90, 28)).toBeNull();
    expect(sparklinePoints([0, 1], 90, 28)).toBe("2.0,26.0 88.0,2.0");
    expect(sparklinePoints([2, -1], 90, 28)).toBe("2.0,2.0 88.0,26.0");
  });
  it("pass rate is null with no cases", () => {
    expect(passRate({ traces_passed: 0, traces_total: 0 })).toBeNull();
    expect(passRate({ traces_passed: 3, traces_total: 4 })).toBe(0.75);
  });
});
