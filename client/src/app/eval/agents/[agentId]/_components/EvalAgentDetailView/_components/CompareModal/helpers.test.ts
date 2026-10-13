import { describe, it, expect } from "vitest";
import type { EvalLineDiff } from "@devdigest/shared";
import { collapseDiff, hasChanges } from "./helpers";

const same = (n: number): EvalLineDiff[] => Array.from({ length: n }, (_, i) => ({ op: "same", text: `s${i}` }));

describe("collapseDiff", () => {
  it("yields nothing for identical prompts", () => {
    expect(hasChanges(same(4))).toBe(false);
    expect(collapseDiff(same(4))).toEqual([]);
  });

  it("keeps added and removed lines with context and folds the long unchanged runs", () => {
    const lines: EvalLineDiff[] = [...same(10), { op: "del", text: "old" }, { op: "add", text: "new" }, ...same(10)];
    const rows = collapseDiff(lines, 2);
    expect(rows[0]).toEqual({ kind: "gap", count: 8 });
    expect(rows.filter((r) => r.kind === "line").map((r) => (r.kind === "line" ? `${r.op}:${r.text}` : ""))).toEqual([
      "same:s8", "same:s9", "del:old", "add:new", "same:s0", "same:s1",
    ]);
    expect(rows.at(-1)).toEqual({ kind: "gap", count: 8 });
  });

  it("does not fold a short run and adds no gap row at the edges when the change is there", () => {
    const lines: EvalLineDiff[] = [{ op: "add", text: "a" }, ...same(3), { op: "del", text: "b" }];
    expect(collapseDiff(lines, 3).every((r) => r.kind === "line")).toBe(true);
  });
});
