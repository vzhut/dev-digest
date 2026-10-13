import { describe, it, expect } from "vitest";
import { parseDiffFiles, toWriteBody, validateCase, type CaseForm } from "./helpers";

const DIFF = ["--- a/src/a.ts", "+++ b/src/a.ts", "@@ -0,0 +1,3 @@", "+one", "+two", "+three", "diff --git a/src/b.ts b/src/b.ts", "+++ b/src/b.ts", "@@ -5,2 +5,4 @@", "+x"].join("\n");

const form = (over: Partial<CaseForm> = {}): CaseForm => ({
  name: "stripe-key-leak",
  diff: DIFF,
  type: "must_find",
  file: "src/a.ts",
  startLine: "1",
  endLine: "2",
  title: "",
  prTitle: "",
  prBody: "",
  ...over,
});

describe("parseDiffFiles", () => {
  it("reads files and new-side hunk ranges, with or without diff --git lines", () => {
    expect(parseDiffFiles(DIFF)).toEqual([
      { path: "src/a.ts", ranges: [[1, 3]] },
      { path: "src/b.ts", ranges: [[5, 8]] },
    ]);
    expect(parseDiffFiles("hello")).toEqual([]);
  });
});

describe("validateCase mirrors the server", () => {
  it("is valid for a grounded expectation", () => {
    expect(validateCase(form())).toEqual([]);
  });

  it("reports each reason", () => {
    expect(validateCase(form({ name: "  " }))).toContain("nameRequired");
    expect(validateCase(form({ diff: "" }))).toContain("diffRequired");
    expect(validateCase(form({ diff: "no diff" }))).toContain("diffNoFiles");
    expect(validateCase(form({ file: "" }))).toContain("fileRequired");
    expect(validateCase(form({ file: "src/zzz.ts" }))).toContain("fileNotInDiff");
    expect(validateCase(form({ startLine: "0" }))).toContain("lineRange");
    expect(validateCase(form({ startLine: "3", endLine: "2" }))).toContain("lineRange");
    expect(validateCase(form({ startLine: "1.5" }))).toContain("lineRange");
    expect(validateCase(form({ startLine: "9", endLine: "9" }))).toContain("outsideHunks");
    expect(validateCase(form({ file: "src/b.ts", startLine: "7", endLine: "20" }))).toEqual([]); // overlap is enough
  });
});

describe("toWriteBody", () => {
  it("trims, converts lines and only sends PR meta for hand-written cases", () => {
    const body = toWriteBody(form({ name: " n ", title: " T ", prTitle: " P ", prBody: "B" }), false);
    expect(body).toEqual({
      name: "n",
      input_diff: DIFF,
      expectation: { type: "must_find", file: "src/a.ts", start_line: 1, end_line: 2, title: "T" },
      pr_title: "P",
      pr_body: "B",
    });
    expect("pr_title" in toWriteBody(form(), true)).toBe(false);
  });
});
