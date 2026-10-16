import { describe, it, expect } from "vitest";
import { displayStatus, elapsedMs, isLive, lineRange, scoreColor, takeKind, visibleConflicts } from "./helpers";
import type { RunConflict, RunTake } from "./types";

const take = (verdict: string): RunTake => ({ agent_id: "a", persona: "P", verdict, note: "" }) as RunTake;
const conflict = (line: number, is_conflict: boolean): RunConflict =>
  ({ file: "f.ts", line, end_line: line, title: "t", takes: [], members: [], is_conflict }) as RunConflict;

describe("displayStatus", () => {
  it("shows queued until the first live event, then running", () => {
    expect(displayStatus("queued", false)).toBe("queued");
    expect(displayStatus("running", false)).toBe("queued");
    expect(displayStatus("queued", true)).toBe("running");
    expect(displayStatus("running", true)).toBe("running");
  });

  it("passes settled statuses through regardless of events", () => {
    for (const s of ["done", "failed", "cancelled"] as const) {
      expect(displayStatus(s, false)).toBe(s);
      expect(displayStatus(s, true)).toBe(s);
    }
  });
});

describe("isLive", () => {
  it("is true only for queued and running", () => {
    expect(isLive("queued")).toBe(true);
    expect(isLive("running")).toBe(true);
    expect(isLive("done")).toBe(false);
    expect(isLive("failed")).toBe(false);
    expect(isLive("cancelled")).toBe(false);
  });
});

describe("elapsedMs", () => {
  const ranAt = "2026-10-13T10:00:00.000Z";
  const t0 = Date.parse(ranAt);
  it("measures from the start, never negative, and 0 for an unparsable date", () => {
    expect(elapsedMs(ranAt, t0 + 8200)).toBe(8200);
    expect(elapsedMs(ranAt, t0 - 5000)).toBe(0);
    expect(elapsedMs("not a date", t0)).toBe(0);
  });
});

describe("visibleConflicts", () => {
  it("keeps everything when off and only is_conflict entries when on", () => {
    const all = [conflict(1, true), conflict(2, false), conflict(3, true)];
    expect(visibleConflicts(all, false)).toHaveLength(3);
    expect(visibleConflicts(all, true).map((c) => c.line)).toEqual([1, 3]);
  });
});

describe("takeKind", () => {
  it("maps non-severity verdicts to their own kind and any severity to flagged", () => {
    expect(takeKind(take("ignored"))).toBe("ignored");
    expect(takeKind(take("failed"))).toBe("failed");
    expect(takeKind(take("cancelled"))).toBe("cancelled");
    expect(takeKind(take("pending"))).toBe("pending");
    expect(takeKind(take("CRITICAL"))).toBe("flagged");
    expect(takeKind(take("LOW"))).toBe("flagged");
  });
});

describe("lineRange", () => {
  it("collapses a single line and joins a real range", () => {
    expect(lineRange(7, 7)).toBe("7");
    expect(lineRange(7, 12)).toBe("7-12");
    expect(lineRange(7, 3)).toBe("7");
  });
});

describe("scoreColor", () => {
  it("is ok from 70, warn from 50, crit below, muted without a score", () => {
    expect(scoreColor(100)).toBe("var(--ok)");
    expect(scoreColor(70)).toBe("var(--ok)");
    expect(scoreColor(69)).toBe("var(--warn)");
    expect(scoreColor(50)).toBe("var(--warn)");
    expect(scoreColor(49)).toBe("var(--crit)");
    expect(scoreColor(0)).toBe("var(--crit)");
    expect(scoreColor(null)).toBe("var(--text-muted)");
    expect(scoreColor(undefined)).toBe("var(--text-muted)");
  });
});
