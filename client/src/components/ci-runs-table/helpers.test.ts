import { describe, expect, it } from "vitest";
import { hasBreakdown, resultOf, safeHttpsUrl } from "./helpers";

describe("resultOf", () => {
  it("maps a failed or skipped run by its status, ignoring the verdict", () => {
    expect(resultOf({ status: "failed", verdict: "pass" })).toBe("failed");
    expect(resultOf({ status: "skipped", verdict: "fail" })).toBe("skipped");
  });

  it("judges a finished run by its verdict", () => {
    expect(resultOf({ status: "done", verdict: "fail" })).toBe("fail");
    expect(resultOf({ status: "done", verdict: "pass" })).toBe("pass");
  });

  it("treats a finished run without a verdict as passed", () => {
    expect(resultOf({ status: "done", verdict: null })).toBe("pass");
  });
});

describe("safeHttpsUrl", () => {
  it("passes https URLs through unchanged", () => {
    expect(safeHttpsUrl("https://github.com/acme/api/pull/3")).toBe("https://github.com/acme/api/pull/3");
  });

  it.each([
    ["javascript:alert(1)"],
    ["http://github.com/acme/api"],
    ["data:text/html,<b>x</b>"],
    ["not a url"],
    ["//github.com/x"],
    [""],
  ])("rejects %j", (url) => {
    expect(safeHttpsUrl(url)).toBeNull();
  });

  it("rejects null and undefined", () => {
    expect(safeHttpsUrl(null)).toBeNull();
    expect(safeHttpsUrl(undefined)).toBeNull();
  });
});

describe("hasBreakdown", () => {
  it("is true only when all three severity counts are known", () => {
    expect(hasBreakdown({ critical: 1, warning: 0, suggestion: 2 })).toBe(true);
    expect(hasBreakdown({ critical: 0, warning: 0, suggestion: 0 })).toBe(true);
  });

  it("is false when any count is missing", () => {
    expect(hasBreakdown({ critical: null, warning: 0, suggestion: 0 })).toBe(false);
    expect(hasBreakdown({ critical: 0, warning: null, suggestion: 0 })).toBe(false);
    expect(hasBreakdown({ critical: 0, warning: 0, suggestion: null })).toBe(false);
  });
});
