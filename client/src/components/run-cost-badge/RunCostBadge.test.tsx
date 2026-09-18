/**
 * RunCostBadge — the money formatting contract every cost surface relies on.
 * The load-bearing rule: unknown cost renders "—", a real zero renders a
 * number. Conflating the two would report a failed or unpriced run as free.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";
import { formatCostUsd, formatTokensTotal } from "@/lib/format-cost";

afterEach(cleanup);

describe("formatCostUsd", () => {
  it.each([
    [null, "—"],
    [undefined, "—"],
    [0, "$0.0000"],
    [0.0013, "$0.0013"],
    [0.014, "$0.014"],
    [0.06, "$0.060"],
    [1.5, "$1.50"],
    [12.345, "$12.35"],
  ])("%s → %s", (input, expected) => {
    expect(formatCostUsd(input)).toBe(expected);
  });
});

describe("formatTokensTotal", () => {
  it("sums both directions with thousands separators", () => {
    expect(formatTokensTotal(9000, 119)).toBe("9,119 tok");
  });

  it("counts a recorded direction even when the other is null", () => {
    expect(formatTokensTotal(500, null)).toBe("500 tok");
  });

  it("returns null when nothing was recorded, so callers can omit it", () => {
    expect(formatTokensTotal(null, null)).toBeNull();
  });
});

describe("RunCostBadge", () => {
  it("compact renders the bare price", () => {
    render(<RunCostBadge cost={0.014} />);
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("detailed renders tokens and price", () => {
    render(<RunCostBadge variant="detailed" cost={0.0013} tokensIn={9000} tokensOut={119} />);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("detailed degrades to the price alone when no usage was recorded", () => {
    render(<RunCostBadge variant="detailed" cost={0.0013} tokensIn={null} tokensOut={null} />);
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
  });

  it("renders '—' for unknown cost", () => {
    render(<RunCostBadge cost={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
