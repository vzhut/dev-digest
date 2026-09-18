"use client";

import { formatCostUsd, formatTokensTotal, UNKNOWN } from "@/lib/format-cost";

/**
 * What one agent run cost. Two shapes for the two kinds of place it appears:
 *
 *  - `compact`  — bare figure for the PR list COST column: `$0.014`
 *  - `detailed` — usage + price for run rows: `9,119 tok · $0.0013`
 *
 * Both render `—` (never `$0.00`) when the cost is unknown. Purely derived from
 * usage already on the run — this never triggers a model call.
 */
export function RunCostBadge({
  cost,
  tokensIn,
  tokensOut,
  variant = "compact",
}: {
  cost: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
  variant?: "compact" | "detailed";
}) {
  const price = formatCostUsd(cost);
  const tokens = variant === "detailed" ? formatTokensTotal(tokensIn, tokensOut) : null;
  // With no usage recorded, `detailed` degrades to the bare price rather than
  // padding the row with "0 tok".
  const label = tokens ? `${tokens} · ${price}` : price;

  return (
    <span
      className="mono tnum"
      style={{
        fontSize: variant === "compact" ? 12 : 11,
        color: price === UNKNOWN ? "var(--text-muted)" : "var(--text-secondary)",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
