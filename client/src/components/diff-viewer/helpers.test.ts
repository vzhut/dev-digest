import { describe, it, expect } from "vitest";
import { findTargetLine, parsePatch } from "./helpers";

const PATCH = "@@ -1,3 +10,3 @@\n ctx\n-old\n+new\n tail";

describe("findTargetLine", () => {
  it("returns the row index of a new-file line, skipping hunk headers and deleted rows", () => {
    const lines = parsePatch(PATCH);
    expect(findTargetLine(lines, 10)).toBe(1); // ctx
    expect(findTargetLine(lines, 11)).toBe(3); // new (the del row has no new number)
    expect(findTargetLine(lines, 12)).toBe(4);
  });

  it("returns null for a line outside the hunks or when there is no patch", () => {
    expect(findTargetLine(parsePatch(PATCH), 99)).toBeNull();
    expect(findTargetLine(parsePatch(null), 1)).toBeNull();
  });
});
