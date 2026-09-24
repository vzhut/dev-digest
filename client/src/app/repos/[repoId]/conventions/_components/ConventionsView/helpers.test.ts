import { describe, it, expect } from "vitest";
import type { ConventionCandidate, ConventionScan } from "@devdigest/shared";
import { acceptedSummary, dropReasonEntries, totalDropped } from "./helpers";

function candidate(o: Partial<ConventionCandidate>): ConventionCandidate {
  return {
    id: "c1",
    category: "style",
    rule: "r",
    edited: false,
    evidence_path: "a.ts",
    evidence_line_start: 1,
    evidence_line_end: 1,
    evidence_snippet: "x",
    evidence_url: "https://github.com/a/b/blob/sha/a.ts#L1-L1",
    confidence: 0.9,
    status: "pending",
    ...o,
  };
}

function scan(dropped: Record<string, number>): ConventionScan {
  return {
    id: "s1",
    sha: "sha",
    sample_files: 5,
    raw_count: 10,
    kept_count: 3,
    dropped,
    model: "openrouter/x",
    cost_usd: 0.01,
    created_at: "2026-06-01T00:00:00.000Z",
  };
}

describe("acceptedSummary", () => {
  it("counts accepted over the total, regardless of other statuses", () => {
    const candidates = [
      candidate({ id: "1", status: "accepted" }),
      candidate({ id: "2", status: "rejected" }),
      candidate({ id: "3", status: "pending" }),
    ];
    expect(acceptedSummary(candidates)).toEqual({ accepted: 1, total: 3 });
  });

  it("is 0 of 0 for an empty list", () => {
    expect(acceptedSummary([])).toEqual({ accepted: 0, total: 0 });
  });
});

describe("dropReasonEntries / totalDropped", () => {
  it("keeps only non-zero reasons, in verifier check order", () => {
    const s = scan({ duplicate: 2, no_file: 0, quote_mismatch: 3, bad_rule: 1 });
    expect(dropReasonEntries(s)).toEqual([
      { key: "quote_mismatch", count: 3 },
      { key: "bad_rule", count: 1 },
      { key: "duplicate", count: 2 },
    ]);
    expect(totalDropped(s)).toBe(6);
  });

  it("is empty with no scan yet", () => {
    expect(dropReasonEntries(null)).toEqual([]);
    expect(totalDropped(null)).toBe(0);
  });
});
