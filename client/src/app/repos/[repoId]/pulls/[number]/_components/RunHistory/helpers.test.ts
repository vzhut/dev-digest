import { describe, it, expect } from "vitest";
import type { RunSummary, PrCommit } from "@devdigest/shared";
import { outcomeOf, timelineItems, tsOf } from "./helpers";

const run = (o: Partial<RunSummary>) => ({ run_id: "r", status: "done", blockers: 0, findings_count: 0, ran_at: null, ...o }) as RunSummary;
const commit = (o: Partial<PrCommit>) => ({ sha: "abc", message: "m", author: "a", committed_at: null, ...o }) as PrCommit;

describe("outcomeOf", () => {
  it("follows the lifecycle for unsettled runs", () => {
    expect(outcomeOf(run({ status: "running" })).key).toBe("running");
    expect(outcomeOf(run({ status: "failed" })).key).toBe("error");
    expect(outcomeOf(run({ status: "cancelled" })).key).toBe("cancelled");
  });
  it("grades a settled run by blockers, then findings", () => {
    expect(outcomeOf(run({ blockers: 2, findings_count: 3 })).key).toBe("rejected");
    expect(outcomeOf(run({ findings_count: 1 })).key).toBe("reviewed");
    expect(outcomeOf(run({})).key).toBe("approved");
  });
});

describe("tsOf", () => {
  it("parses ISO and sends missing / invalid to 0", () => {
    expect(tsOf("2026-06-01T00:00:00.000Z")).toBe(Date.UTC(2026, 5, 1));
    expect(tsOf(null)).toBe(0);
    expect(tsOf("not a date")).toBe(0);
  });
});

describe("timelineItems", () => {
  it("interleaves runs and commits newest first", () => {
    const items = timelineItems(
      [run({ run_id: "r1", ran_at: "2026-06-02T00:00:00Z" }), run({ run_id: "r2", ran_at: "2026-06-04T00:00:00Z" })],
      [commit({ sha: "c1", committed_at: "2026-06-03T00:00:00Z" })],
    );
    expect(items.map((i) => (i.kind === "run" ? i.run.run_id : i.commit.sha))).toEqual(["r2", "c1", "r1"]);
  });
});
