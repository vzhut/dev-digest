/* EvalMetricBar — a thin coloured progress bar followed by the percentage, as in the run tables. */
"use client";

import { formatMetric } from "@/lib/eval-format";
import { s } from "./styles";

export function EvalMetricBar({ value, color }: { value: number | null | undefined; color: string }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value)) * 100;
  return (
    <span style={s.wrap}>
      <span style={s.track} aria-hidden="true">
        <span style={s.fill(pct, color)} />
      </span>
      <span className="mono" style={s.value}>
        {formatMetric(value)}
      </span>
    </span>
  );
}
