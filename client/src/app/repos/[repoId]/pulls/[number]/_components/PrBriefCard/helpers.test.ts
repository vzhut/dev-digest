import { describe, it, expect } from "vitest";
import { parseFileRef, compactTokens, formatBriefUsage, whenLabel, shortSha } from "./helpers";

describe("PrBriefCard helpers", () => {
  it("parses path, line and range refs and trims a leading ./ or /", () => {
    expect(parseFileRef("src/a.ts")).toEqual({ file: "src/a.ts", line: null, label: "src/a.ts" });
    expect(parseFileRef("./src/a.ts:12")).toEqual({ file: "src/a.ts", line: 12, label: "src/a.ts:12" });
    expect(parseFileRef("/src/a.ts:12-20")).toEqual({ file: "src/a.ts", line: 12, label: "src/a.ts:12-20" });
  });

  it("formats usage like the run cost, with — for an unknown cost", () => {
    const base = { llm_calls: 1, tokens_in: 8200, tokens_out: 1300, duration_ms: 1 };
    expect(formatBriefUsage({ ...base, cost_usd: 0.014 })).toBe("$0.014 8.2K→1.3K");
    expect(formatBriefUsage({ ...base, cost_usd: null })).toBe("— 8.2K→1.3K");
    expect(compactTokens(950)).toBe("950");
    expect(compactTokens(2000)).toBe("2K");
  });

  it("labels time and short sha", () => {
    const now = Date.parse("2026-10-02T12:00:00Z");
    expect(whenLabel("2026-10-02T09:00:00Z", now)).toBe("3h ago");
    expect(whenLabel("2026-10-02T12:00:10Z", now)).toBe("just now");
    expect(whenLabel(null)).toBe("—");
    expect(shortSha("a1b2c3d4e5")).toBe("a1b2c3d");
    expect(shortSha(null)).toBe("—");
  });
});
