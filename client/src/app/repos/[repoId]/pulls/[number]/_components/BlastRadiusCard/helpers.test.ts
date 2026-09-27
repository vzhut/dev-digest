import { describe, it, expect } from "vitest";
import type { BlastRadius } from "@devdigest/shared";
import { callerHref, incompleteNotice, refFor, statsOf } from "./helpers";

const BASE: BlastRadius = {
  changed_symbols: [{ name: "run", file: "a.ts", kind: "function" }],
  downstream: [],
  summary: "1 changed symbol has no callers.",
};

describe("BlastRadiusCard helpers", () => {
  it("links repoFullName + ref + file/line into a GitHub blob URL", () => {
    expect(callerHref("vzhut/dev-digest", "23e6c2c", "server/src/modules/pulls/routes.ts", 42)).toBe(
      "https://github.com/vzhut/dev-digest/blob/23e6c2c/server/src/modules/pulls/routes.ts#L42",
    );
  });

  it("returns null when repoFullName hasn't loaded yet", () => {
    expect(callerHref(null, "23e6c2c", "a.ts", 1)).toBeNull();
  });

  it("uses indexed_sha as the ref when present", () => {
    expect(refFor({ indexed_sha: "23e6c2c" }, "main")).toBe("23e6c2c");
  });

  it("falls back to the PR's base ref when there is no indexed_sha", () => {
    expect(refFor({ indexed_sha: null }, "main")).toBe("main");
    expect(refFor({ indexed_sha: undefined }, "main")).toBe("main");
  });

  it("uses the server's stats when present", () => {
    const blast: BlastRadius = {
      ...BASE,
      stats: { symbols_changed: 5, symbols_affected: 2, callers: 3, endpoints: 4, crons: 0 },
    };
    expect(statsOf(blast)).toEqual({ symbols_changed: 5, symbols_affected: 2, callers: 3, endpoints: 4, crons: 0 });
  });

  it("derives stats from the map when the server omitted them", () => {
    const blast: BlastRadius = {
      ...BASE,
      downstream: [
        {
          symbol: "run",
          file: "a.ts",
          callers: [{ name: "caller1", file: "b.ts", line: 1 }],
          callers_total: 3,
          endpoints_affected: ["GET /a"],
          crons_affected: [],
        },
        {
          symbol: "other",
          file: "c.ts",
          callers: [{ name: "caller2", file: "d.ts", line: 2 }],
          endpoints_affected: ["GET /a", "GET /b"],
          crons_affected: ["nightly"],
        },
      ],
    };
    expect(statsOf(blast)).toEqual({ symbols_changed: 1, symbols_affected: 2, callers: 4, endpoints: 2, crons: 1 });
  });

  it("flags degraded maps and passes through the reason", () => {
    expect(incompleteNotice({ degraded: true, reason: "index_partial" })).toEqual({
      show: true,
      reasonKey: "index_partial",
    });
    expect(incompleteNotice({ degraded: false, reason: null })).toEqual({ show: false, reasonKey: null });
    expect(incompleteNotice({ degraded: undefined, reason: undefined })).toEqual({ show: false, reasonKey: null });
  });
});
