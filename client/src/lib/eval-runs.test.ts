import { describe, it, expect } from "vitest";
import type { EvalSuiteRun } from "@devdigest/shared";
import { newestFirst } from "./eval-runs";

const run = (id: string, ran_at: string) => ({ id, ran_at }) as EvalSuiteRun;

describe("newestFirst", () => {
  it("sorts by ran_at descending whatever the input order, without mutating the input", () => {
    const input = [run("a", "2026-10-01T00:00:00Z"), run("c", "2026-10-03T00:00:00Z"), run("b", "2026-10-02T00:00:00Z")];
    expect(newestFirst(input).map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(input.map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("compares instants, not strings (different offsets), and copes with an empty list", () => {
    const earlierInParis = run("p", "2026-10-01T12:00:00+02:00"); // 10:00Z
    const laterInUtc = run("u", "2026-10-01T11:00:00Z");
    expect(newestFirst([earlierInParis, laterInUtc]).map((r) => r.id)).toEqual(["u", "p"]);
    expect(newestFirst([])).toEqual([]);
  });
});
