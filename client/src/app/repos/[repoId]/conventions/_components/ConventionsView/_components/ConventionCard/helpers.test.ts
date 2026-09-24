import { describe, it, expect } from "vitest";
import { confidenceColor, confidencePct, formatLocation } from "./helpers";

describe("confidenceColor", () => {
  it("green at/above 0.8, amber at/above 0.6, muted below", () => {
    expect(confidenceColor(0.95)).toBe("var(--ok)");
    expect(confidenceColor(0.8)).toBe("var(--ok)");
    expect(confidenceColor(0.79)).toBe("var(--warn)");
    expect(confidenceColor(0.6)).toBe("var(--warn)");
    expect(confidenceColor(0.59)).toBe("var(--text-muted)");
  });
});

describe("confidencePct", () => {
  it("rounds to a whole percentage", () => {
    expect(confidencePct(0.873)).toBe(87);
  });
});

describe("formatLocation", () => {
  it("single line vs a range", () => {
    expect(formatLocation("a.ts", 5, 5)).toBe("a.ts:5");
    expect(formatLocation("a.ts", 5, 9)).toBe("a.ts:5-9");
  });
});
