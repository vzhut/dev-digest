import { describe, it, expect } from "vitest";
import { diffLines, hasChanges } from "./helpers";

describe("diffLines", () => {
  it("marks added and removed lines", () => {
    const d = diffLines("a\nb\nc", "a\nx\nc");
    expect(d).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "x" },
      { kind: "same", text: "c" },
    ]);
    expect(hasChanges(d)).toBe(true);
  });

  it("reports identical text as unchanged", () => {
    expect(hasChanges(diffLines("a\nb", "a\nb"))).toBe(false);
  });
});
