import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiff } from "@devdigest/shared";
import { groupFiles, hasReview, latestReviewFindings, filesWithFindings, findingsByFile } from "./helpers";

const file = (path: string): PrFile => ({ path, additions: 1, deletions: 0, patch: null });
const sf = (path: string) => ({ path, additions: 1, deletions: 0, finding_lines: [] });
const smart = (groups: SmartDiff["groups"]): SmartDiff => ({
  groups,
  split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
});
const finding = (id: string, path: string) => ({ id, file: path }) as FindingRecord;
const review = (kind: "summary" | "review", findings: FindingRecord[]) =>
  ({ kind, findings }) as ReviewRecord;

describe("groupFiles", () => {
  it("orders groups, omits empty ones, ignores unknown paths and appends missing files to core", () => {
    const files = [file("a.ts"), file("b.test.ts"), file("README.md"), file("new.ts")];
    const groups = groupFiles(
      smart([
        { role: "docs", files: [sf("README.md")] },
        { role: "tests", files: [sf("b.test.ts"), sf("ghost.ts")] },
        { role: "core", files: [sf("a.ts")] },
        { role: "wiring", files: [] },
      ]),
      files,
    );
    expect(groups.map((g) => g.role)).toEqual(["core", "tests", "docs"]);
    expect(groups[0]!.files.map((f) => f.path)).toEqual(["a.ts", "new.ts"]);
    expect(groups[1]!.files.map((f) => f.path)).toEqual(["b.test.ts"]);
  });
});

describe("latestReviewFindings / filesWithFindings", () => {
  it("uses the first review-kind entry and counts distinct files", () => {
    const f1 = finding("1", "a.ts");
    const f2 = finding("2", "a.ts");
    const found = latestReviewFindings([review("summary", [finding("x", "z.ts")]), review("review", [f1, f2]), review("review", [])]);
    expect(found).toEqual([f1, f2]);
    expect(latestReviewFindings([review("summary", [])])).toEqual([]);
    expect(filesWithFindings([file("a.ts"), file("b.ts")], { "a.ts": [f1, f2] })).toBe(1);
  });
});

describe("findingsByFile", () => {
  it("groups findings by file path", () => {
    const fx = (id: string, file: string) => ({ id, file }) as FindingRecord;
    const out = findingsByFile([fx("1", "a.ts"), fx("2", "b.ts"), fx("3", "a.ts")]);
    expect(out["a.ts"]!.map((x) => x.id)).toEqual(["1", "3"]);
    expect(out["b.ts"]!.map((x) => x.id)).toEqual(["2"]);
  });
});

describe("hasReview", () => {
  it("is true only when a review-kind entry exists", () => {
    expect(hasReview([review("summary", [])])).toBe(false);
    expect(hasReview([])).toBe(false);
    expect(hasReview([review("summary", []), review("review", [])])).toBe(true);
  });
});
