import { describe, it, expect } from "vitest";
import type { Tour, TourIndexInfo } from "@devdigest/shared";
import { coverageOf, isSectionId, isStale, pageMode, partialSkipped, repoShortName, shareUrl, usageParts } from "./helpers";

const usage = { llm_calls: 1 as const, tokens_in: 8000, tokens_out: 1119, cost_usd: 0.0012, model: "m", duration_ms: 1, dropped_items: 0 };
const index = (over: Partial<TourIndexInfo> = {}): TourIndexInfo => ({
  status: "ready", reason: null, files_indexed: 10, files_skipped: 0, files_total: 10, bounded: false, hotness_available: true, ...over,
});

describe("onboarding view helpers", () => {
  it("formats usage with the D3 special case and unknown cost", () => {
    expect(usageParts(usage)).toEqual({ calls: 1, tokens: "9,119 tok", cost: "$0.0012" });
    expect(usageParts({ ...usage, cost_usd: null })).toMatchObject({ cost: "—" });
    expect(usageParts({ ...usage, llm_calls: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0 })).toEqual({ calls: 0 });
  });

  it("derives coverage without guessing an unknown total", () => {
    expect(coverageOf(index())).toEqual({ kind: "all", n: 10 });
    expect(coverageOf(index({ files_indexed: 5000, files_total: 12450, bounded: true }))).toEqual({ kind: "bounded", n: 5000, m: 12450 });
    expect(coverageOf(index({ files_total: null }))).toEqual({ kind: "unknown", n: 10 });
    expect(partialSkipped(index({ status: "partial", files_skipped: 3 }))).toBe(3);
    expect(partialSkipped(index())).toBeNull();
  });

  it("picks the screen, staleness, share URL and ids", () => {
    const tour = { source_sha: "a" } as Tour;
    expect(pageMode({ status: "not_cloned", index_sha: null })).toBe("not_cloned");
    expect(pageMode({ status: "none", index_sha: null })).toBe("empty");
    expect(pageMode({ status: "generating", tour: null, index_sha: null })).toBe("empty");
    expect(pageMode({ status: "ready", tour, index_sha: "a" })).toBe("tour");
    expect(isStale(tour, "b")).toBe(true);
    expect(isStale(tour, "a")).toBe(false);
    expect(isStale(tour, null)).toBe(false);
    expect(shareUrl({ origin: "http://h", pathname: "/repos/r1/onboarding", hash: "#reading-path" })).toBe("http://h/repos/r1/onboarding#reading-path");
    expect(repoShortName("acme/payments-api")).toBe("payments-api");
    expect(isSectionId("first-tasks")).toBe(true);
    expect(isSectionId("nope")).toBe(false);
  });
});
