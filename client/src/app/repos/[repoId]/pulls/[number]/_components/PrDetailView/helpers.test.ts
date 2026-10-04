import { describe, it, expect } from "vitest";
import type { ReviewRecord } from "@devdigest/shared";
import { diffDeepLinkQuery, latestReviewSummary, parseDiffTarget } from "./helpers";

const finding = (severity: string, dismissed_at: string | null = null) => ({ severity, dismissed_at });
const review = (over: Record<string, unknown>) =>
  ({ kind: "review", verdict: "request_changes", score: 70, agent_name: "Bug hunter", findings: [], ...over }) as unknown as ReviewRecord;

describe("parseDiffTarget", () => {
  it("needs both file and a positive integer line", () => {
    expect(parseDiffTarget("src/a.ts", "12")).toEqual({ file: "src/a.ts", line: 12 });
    expect(parseDiffTarget("src/a.ts", null)).toBeNull();
    expect(parseDiffTarget(null, "12")).toBeNull();
    expect(parseDiffTarget("src/a.ts", "0")).toBeNull();
    expect(parseDiffTarget("src/a.ts", "1x")).toBeNull();
  });
});

describe("diffDeepLinkQuery", () => {
  it("sets tab, file and line in one query and keeps other params", () => {
    const qs = diffDeepLinkQuery("tab=overview&trace=r1", "src/a b.ts", 7);
    const sp = new URLSearchParams(qs);
    expect(sp.get("tab")).toBe("diff");
    expect(sp.get("file")).toBe("src/a b.ts");
    expect(sp.get("line")).toBe("7");
    expect(sp.get("trace")).toBe("r1");
    expect(qs).toContain("file=src%2Fa");
  });
});

describe("latestReviewSummary", () => {
  it("is null without a review of kind review or without a verdict", () => {
    expect(latestReviewSummary([])).toBeNull();
    expect(latestReviewSummary([review({ kind: "summary" })])).toBeNull();
    expect(latestReviewSummary([review({ verdict: null })])).toBeNull();
  });

  it("takes the newest review and counts undismissed CRITICAL findings as blockers", () => {
    const r = latestReviewSummary([
      review({ findings: [finding("CRITICAL"), finding("CRITICAL", "2026-10-01"), finding("LOW")] }),
      review({ verdict: "approve" }),
    ]);
    expect(r).toEqual({ verdict: "request_changes", score: 70, findingsCount: 3, blockers: 1, agentName: "Bug hunter" });
  });
});
