/**
 * Formatting for run cost + token usage, shared by every surface that shows
 * what a review run cost: the PR list COST column, the Agent runs timeline, the
 * Run Trace stats panel and the verdict banner.
 *
 * The precision ladder mirrors the model-price label in `model-label.ts`, so
 * dollar figures read consistently across the app.
 */

/** Em dash for "we don't know", kept in one place so every surface agrees. */
export const UNKNOWN = "—";

/**
 * USD for one run (or a sum of runs).
 *
 * `null`/`undefined` means UNKNOWN — an unpriced model, or a run that died
 * before any usage came back — and renders "—". A real 0 is a known cost (free
 * models exist) and renders as a number, never as "—".
 */
export function formatCostUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return UNKNOWN;
  if (n >= 1) return `$${n.toFixed(2)}`; // $1.24
  if (n >= 0.01) return `$${n.toFixed(3)}`; // $0.014
  return `$${n.toFixed(4)}`; // $0.0013
}

/**
 * Total tokens burned by a run, thousands-separated: `9,119 tok`.
 * Returns null when neither direction was recorded, so callers can fall back to
 * showing the cost alone rather than printing "0 tok".
 */
export function formatTokensTotal(
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): string | null {
  if (tokensIn == null && tokensOut == null) return null;
  const total = (tokensIn ?? 0) + (tokensOut ?? 0);
  return `${total.toLocaleString("en-US")} tok`;
}
