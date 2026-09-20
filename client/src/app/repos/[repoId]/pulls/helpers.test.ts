import { describe, it, expect } from "vitest";
import type { PrMeta } from "@devdigest/shared";
import { filterPulls, pullCounts, relativeTime } from "./helpers";

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 1,
    title: "Untitled",
    author: "a",
    branch: "b",
    base: "main",
    head_sha: "sha",
    additions: 1,
    deletions: 1,
    files_count: 1,
    status: "needs_review",
    opened_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    score: null,
    cost_usd: null,
    latest_findings: null,
    ...o,
  } as PrMeta;
}

const PULLS = [
  pr({ number: 10, title: "Add rate limiting", status: "needs_review", updated_at: "2026-06-03T00:00:00.000Z" }),
  pr({ number: 11, title: "Fix login bug", status: "reviewed", updated_at: "2026-06-05T00:00:00.000Z" }),
  pr({ number: 12, title: "Bump deps", status: "merged", updated_at: "2026-06-01T00:00:00.000Z" }),
];

describe("filterPulls", () => {
  it("filters by status, 'all' keeps everything", () => {
    expect(filterPulls(PULLS, { status: "reviewed", query: "", sort: "newest" }).map((p) => p.number)).toEqual([11]);
    expect(filterPulls(PULLS, { status: "all", query: "", sort: "newest" })).toHaveLength(3);
  });
  it("searches title (case-insensitive) and PR number", () => {
    expect(filterPulls(PULLS, { status: "all", query: "  LOGIN ", sort: "newest" }).map((p) => p.number)).toEqual([11]);
    expect(filterPulls(PULLS, { status: "all", query: "12", sort: "newest" }).map((p) => p.number)).toEqual([12]);
  });
  it("sorts by updated_at, newest first unless 'oldest'", () => {
    expect(filterPulls(PULLS, { status: "all", query: "", sort: "newest" }).map((p) => p.number)).toEqual([11, 10, 12]);
    expect(filterPulls(PULLS, { status: "all", query: "", sort: "oldest" }).map((p) => p.number)).toEqual([12, 10, 11]);
  });
  it("does not mutate the input", () => {
    const copy = [...PULLS];
    filterPulls(PULLS, { status: "all", query: "", sort: "oldest" });
    expect(PULLS).toEqual(copy);
  });
});

describe("pullCounts", () => {
  it("counts open review statuses and needs-review", () => {
    expect(pullCounts(PULLS)).toEqual({ open: 2, needsReview: 1 });
  });
});

describe("relativeTime", () => {
  const NOW = Date.parse("2026-06-11T12:00:00.000Z");
  it("buckets into now / minutes / hours / days against the injected clock", () => {
    expect(relativeTime("2026-06-11T11:59:40.000Z", NOW)).toBe("now");
    expect(relativeTime("2026-06-11T11:20:00.000Z", NOW)).toBe("40m");
    expect(relativeTime("2026-06-11T09:00:00.000Z", NOW)).toBe("3h");
    expect(relativeTime("2026-06-09T12:00:00.000Z", NOW)).toBe("2d");
  });
  it("never goes negative for a future timestamp", () => {
    expect(relativeTime("2026-06-12T12:00:00.000Z", NOW)).toBe("now");
  });
  it("renders a dash for missing or unparseable input", () => {
    expect(relativeTime(null, NOW)).toBe("—");
    expect(relativeTime("not a date", NOW)).toBe("—");
  });
});
