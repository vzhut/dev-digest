/** Geometry helpers for the inline-SVG eval charts (no chart library). Pure. */

/** Pass rate of a run, or null when it had no cases. */
export function passRate(p: { traces_passed: number; traces_total: number }): number | null {
  return p.traces_total === 0 ? null : p.traces_passed / p.traces_total;
}

/**
 * `points` attribute of a polyline for values in `lo`..`hi` (default 0..1; nulls skipped, x spread over the kept
 * points). Fewer than two points → null: a single dot is not a trend, and no chart beats a lie.
 */
export function sparklinePoints(
  values: (number | null)[],
  width: number,
  height: number,
  lo = 0,
  hi = 1,
): string | null {
  const kept = values.filter((v): v is number => v != null);
  if (kept.length < 2) return null;
  const pad = 2;
  return kept
    .map((v, i) => {
      const x = pad + (i * (width - 2 * pad)) / (kept.length - 1);
      const y = pad + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (height - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
