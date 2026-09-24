import { describe, it, expect } from "vitest";
import { withSearchParam } from "./search-params";
import { apiErrorMessage, ApiError } from "./api";

describe("withSearchParam", () => {
  it("sets a param and keeps the others", () => {
    expect(withSearchParam("tab=findings&trace=r1", "tab", "diff")).toBe("tab=diff&trace=r1");
  });
  it("adds a param to an empty query", () => {
    expect(withSearchParam("", "status", "all")).toBe("status=all");
  });
  it("removes a param on null", () => {
    expect(withSearchParam("tab=findings&trace=r1", "trace", null)).toBe("tab=findings");
    expect(withSearchParam("trace=r1", "trace", null)).toBe("");
  });
});

describe("apiErrorMessage", () => {
  it("uses the server message for an ApiError", () => {
    expect(apiErrorMessage(new ApiError("PR not found", 404), "fallback")).toBe("PR not found");
  });
  it("falls back for anything else", () => {
    expect(apiErrorMessage(new TypeError("Failed to fetch"), "fallback")).toBe("fallback");
    expect(apiErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});
