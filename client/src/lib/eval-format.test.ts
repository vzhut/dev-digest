import { describe, it, expect } from "vitest";
import {
  deltaDirection,
  deltaParts,
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

  it("describes every delta as a direction and a magnitude (the wording is i18n)", () => {
    expect(deltaParts(0.06)).toEqual({ direction: "up", points: 6 });
    expect(deltaParts(-0.123)).toEqual({ direction: "down", points: 12.3 });
    expect(deltaParts(0)).toEqual({ direction: "flat", points: 0 });
    expect(deltaParts(0.0001)).toEqual({ direction: "flat", points: 0 });
    expect(deltaParts(null)).toEqual({ direction: "unknown", points: null });
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
