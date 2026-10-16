import { describe, it, expect } from "vitest";
import type { AgentRunEstimate } from "@devdigest/shared";
import { estimateParts, formatCostUsd, runMetaParts, selectionTotalParts, sumKnown } from "./multi-agent-format";

const est = (agent_id: string, ms: number | null, usd: number | null): AgentRunEstimate => ({
  agent_id,
  est_duration_ms: ms,
  est_cost_usd: usd,
});

describe("formatCostUsd", () => {
  it("uses two decimals from one cent up, four below a cent, and a dash when unknown", () => {
    expect(formatCostUsd(0.2)).toBe("$0.20");
    expect(formatCostUsd(0.01)).toBe("$0.01");
    expect(formatCostUsd(0.0096)).toBe("$0.0096");
    expect(formatCostUsd(0)).toBe("$0.00");
    expect(formatCostUsd(null)).toBe("—");
    expect(formatCostUsd(undefined)).toBe("—");
    expect(formatCostUsd(Number.NaN)).toBe("—");
  });
});

describe("sumKnown", () => {
  it("sums the known values and is null when there are none", () => {
    expect(sumKnown([1, null, 2.5, undefined])).toBe(3.5);
    expect(sumKnown([null, undefined])).toBeNull();
    expect(sumKnown([])).toBeNull();
  });
});

describe("estimateParts", () => {
  it("is null without history and formats duration and cost otherwise", () => {
    expect(estimateParts(undefined)).toBeNull();
    expect(estimateParts(est("a", null, null))).toBeNull();
    expect(estimateParts(est("a", 8200, 0.2))).toEqual({ duration: "8.2s", cost: "$0.20" });
    expect(estimateParts(est("a", 8200, null))).toEqual({ duration: "8.2s", cost: "—" });
  });
});

describe("selectionTotalParts", () => {
  it("takes the slowest duration (parallel) and the summed known cost", () => {
    const total = selectionTotalParts([est("a", 4000, 0.1), est("b", 8200, 0.1), est("c", null, null)]);
    expect(total).toEqual({ duration: "8.2s", cost: "$0.20" });
  });

  it("is a dash on both sides when nothing is known", () => {
    expect(selectionTotalParts([])).toEqual({ duration: "—", cost: "—" });
    expect(selectionTotalParts([est("a", null, null)])).toEqual({ duration: "—", cost: "—" });
  });
});

describe("runMetaParts", () => {
  it("shows a dash wall-clock while the run is unfinished", () => {
    expect(runMetaParts(null, [0.1, null])).toEqual({ wall: "—", cost: "$0.10" });
    expect(runMetaParts(undefined, [null])).toEqual({ wall: "—", cost: "—" });
  });

  it("formats the wall-clock and sums the known costs", () => {
    expect(runMetaParts(8200, [0.1, null, 0.1])).toEqual({ wall: "8.2s", cost: "$0.20" });
  });
});
