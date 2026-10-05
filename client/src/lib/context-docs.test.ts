import { describe, it, expect } from "vitest";
import type { ContextDoc } from "@devdigest/shared";
import {
  buildChecklistRows,
  filterRows,
  attachedCount,
  selectionTokens,
  moveRow,
  toPaths,
  isAttachable,
} from "./context-docs";

const doc = (path: string, type: ContextDoc["type"], tokens: number): ContextDoc => ({
  path,
  type,
  size_bytes: tokens * 4,
  tokens,
  updated_at: "2026-10-01T00:00:00Z",
  used_by_agents: 0,
});

const DOCS = [
  doc("docs/b.md", "docs", 20),
  doc("specs/a.md", "specs", 100),
  doc("INSIGHTS.md", "insights", 7),
  doc('docs/bad".md', "docs", 3),
];

describe("buildChecklistRows", () => {
  it("puts attached rows first in saved order, then the rest by type/path", () => {
    const rows = buildChecklistRows(DOCS, ["docs/b.md", "specs/a.md"]);
    expect(rows.map((r) => r.path)).toEqual(["docs/b.md", "specs/a.md", 'docs/bad".md', "INSIGHTS.md"]);
    expect(rows.slice(0, 2).every((r) => r.attached)).toBe(true);
  });

  it("adds a missing row for an attached path absent from the listing", () => {
    const rows = buildChecklistRows(DOCS, ["gone.md"]);
    expect(rows[0]).toMatchObject({ path: "gone.md", missing: true, attached: true, tokens: null });
  });

  it("marks listed paths that fail ContextPath as not attachable", () => {
    const rows = buildChecklistRows(DOCS, []);
    expect(rows.find((r) => r.path === 'docs/bad".md')?.attachable).toBe(false);
    expect(rows.find((r) => r.path === "specs/a.md")?.attachable).toBe(true);
  });

  it("adds read-only inherited rows carrying the skill name", () => {
    const rows = buildChecklistRows(DOCS, [], [{ skill_id: "s1", skill_name: "Security", paths: ["specs/a.md"] }]);
    const inh = rows.find((r) => r.inheritedFrom === "Security");
    expect(inh).toMatchObject({ path: "specs/a.md", attached: false, attachable: false, tokens: 100 });
  });
});

describe("filter / counts / tokens", () => {
  const rows = buildChecklistRows(DOCS, ["specs/a.md", "docs/b.md"], [
    { skill_id: "s1", skill_name: "Sec", paths: ["INSIGHTS.md"] },
  ]);

  it("filters by case-insensitive substring and keeps all on empty query", () => {
    expect(filterRows(rows, "SPECS").map((r) => r.path)).toEqual(["specs/a.md"]);
    expect(filterRows(rows, "  ")).toBe(rows);
  });

  it("excludes inherited rows from the count and the token sum", () => {
    expect(attachedCount(rows)).toBe(2);
    expect(selectionTokens(rows)).toBe(120);
  });

  it("ignores missing rows in the token sum", () => {
    expect(selectionTokens(buildChecklistRows(DOCS, ["gone.md", "specs/a.md"]))).toBe(100);
  });
});

describe("moveRow / toPaths", () => {
  it("swaps neighbours and is a no-op at the edges", () => {
    expect(moveRow(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveRow(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    const same = ["a", "b"];
    expect(moveRow(same, 0, -1)).toBe(same);
    expect(moveRow(same, 1, 1)).toBe(same);
  });

  it("returns attached paths in row order, without inherited rows", () => {
    const rows = buildChecklistRows(DOCS, ["docs/b.md", "specs/a.md"], [
      { skill_id: "s1", skill_name: "Sec", paths: ["INSIGHTS.md"] },
    ]);
    expect(toPaths(moveRow(rows, 0, 1))).toEqual(["specs/a.md", "docs/b.md"]);
  });
});

describe("isAttachable", () => {
  it("mirrors the ContextPath rules", () => {
    expect(isAttachable("docs/a.md")).toBe(true);
    for (const bad of ["../x.md", "/abs.md", "a.txt", 'a".md', "a\\b.md", "a\n.md", "a//b.md", "./a.md", ""]) {
      expect(isAttachable(bad)).toBe(false);
    }
  });
});
