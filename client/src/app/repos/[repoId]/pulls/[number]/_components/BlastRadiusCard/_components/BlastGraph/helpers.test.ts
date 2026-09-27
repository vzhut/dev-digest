import { describe, it, expect } from "vitest";
import type { DownstreamImpact } from "@devdigest/shared";
import { escapeMermaidLabel, toMermaidFlowchart } from "./helpers";

function downstream(overrides: Partial<DownstreamImpact> = {}): DownstreamImpact {
  return {
    symbol: "runReview",
    file: "server/src/modules/reviews/service.ts",
    callers: [{ name: "handler", file: "server/src/modules/pulls/routes.ts", line: 42 }],
    callers_total: 1,
    endpoints_affected: ["GET /pulls/:id"],
    crons_affected: [],
    ...overrides,
  };
}

describe("escapeMermaidLabel", () => {
  it("escapes quotes and strips mermaid-syntax characters", () => {
    expect(escapeMermaidLabel('a"b]')).not.toContain('"');
    expect(escapeMermaidLabel('a"b]')).not.toContain("]");
    expect(escapeMermaidLabel('a"b]')).toBe("a#quot;b");
    expect(escapeMermaidLabel("multi\nline`x`{y}(z)<w>")).toBe("multilinexyzw");
  });
});

describe("toMermaidFlowchart", () => {
  it("returns null when there is no downstream impact to graph", () => {
    expect(toMermaidFlowchart({ downstream: [] }, { maxCallersPerSymbol: 5, maxNodes: 40 })).toBeNull();
  });

  it("builds a flowchart with escaped labels and no raw injection characters", () => {
    const chart = toMermaidFlowchart(
      { downstream: [downstream({ symbol: 'a"b]' })] },
      { maxCallersPerSymbol: 5, maxNodes: 40 },
    );

    expect(chart).not.toBeNull();
    expect(chart!.split("\n")[0]).toBe("flowchart LR");
    const symbolLine = chart!.split("\n").find((line) => line.includes("a#quot;b"));
    expect(symbolLine).toBeDefined();
    expect(symbolLine).not.toContain('"b]');
  });

  it("caps nodes at maxNodes across symbols, callers and endpoints", () => {
    const many: DownstreamImpact[] = Array.from({ length: 10 }, (_, i) =>
      downstream({
        symbol: `sym${i}`,
        callers: Array.from({ length: 10 }, (_, j) => ({ name: `caller${j}`, file: `f${j}.ts`, line: j })),
      }),
    );
    const chart = toMermaidFlowchart({ downstream: many }, { maxCallersPerSymbol: 5, maxNodes: 40 });

    expect(chart).not.toBeNull();
    const nodeIds = new Set<string>();
    for (const match of chart!.matchAll(/\b([sce]\d+)\[/g)) nodeIds.add(match[1] ?? "");
    expect(nodeIds.size).toBeLessThanOrEqual(40);
  });

  it("caps callers per symbol at maxCallersPerSymbol", () => {
    const group = downstream({
      callers: Array.from({ length: 8 }, (_, j) => ({ name: `caller${j}`, file: `f${j}.ts`, line: j })),
      endpoints_affected: [],
    });
    const chart = toMermaidFlowchart({ downstream: [group] }, { maxCallersPerSymbol: 5, maxNodes: 40 });

    const callerNodeIds = new Set<string>();
    for (const match of chart!.matchAll(/\b(c\d+)\[/g)) callerNodeIds.add(match[1] ?? "");
    expect(callerNodeIds.size).toBe(5);
  });
});
