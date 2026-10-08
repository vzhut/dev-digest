import { describe, it, expect } from "vitest";
import {
  deltaDirection,
  formatDelta,
  formatMetric,
  formatRunCost,
  formatRunStamp,
  progressLabel,
} from "./eval-format";

describe("eval formatting", () => {
  it("renders a null metric as an em dash, never 0% or 100%", () => {
    expect(formatMetric(null)).toBe("—");
    expect(formatMetric(undefined)).toBe("—");
    expect(formatMetric(0)).toBe("0%");
    expect(formatMetric(0.873)).toBe("87.3%");
    expect(formatMetric(1)).toBe("100%");
  });

  it("gives every delta a sign and an arrow", () => {
    expect(formatDelta(0.06)).toBe("▲ +6 pts");
    expect(formatDelta(-0.123)).toBe("▼ −12.3 pts");
    expect(formatDelta(0)).toBe("▬ 0 pts");
    expect(formatDelta(0.0001)).toBe("▬ 0 pts");
    expect(formatDelta(null)).toBe("—");
    expect(deltaDirection(-0.5)).toBe("down");
  });

  it("marks a partial cost and never shows an unknown cost as $0", () => {
    expect(formatRunCost(0.02, false)).toBe("$0.020");
    expect(formatRunCost(0.02, true)).toBe("≥ $0.020");
    expect(formatRunCost(null, true)).toBe("—");
    expect(formatRunCost(0, false)).toBe("$0.0000");
  });

  it("formats progress and run stamps", () => {
    expect(progressLabel(2, 5)).toBe("2 / 5");
    expect(formatRunStamp(new Date(2026, 9, 8, 9, 14).toISOString())).toBe("2026-10-08 09:14");
    expect(formatRunStamp("nope")).toBe("nope");
  });
});

describe("formatDuration", () => {
  it("renders seconds with one decimal and a dash for unknown", async () => {
    const { formatDuration } = await import("./eval-format");
    expect(formatDuration(12345)).toBe("12.3s");
    expect(formatDuration(null)).toBe("—");
  });
});
