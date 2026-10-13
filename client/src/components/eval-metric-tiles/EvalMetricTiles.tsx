/* EvalMetricTiles — the latest run's metrics, each with its change against the previous run (sign AND
   arrow, not colour alone) and an optional trend sparkline. Shared by the Evals tab and the per-agent view. */
"use client";

import { useTranslations } from "next-intl";
import type { EvalMetricKey, EvalSuiteRun, EvalSuiteTrendPoint } from "@devdigest/shared";
import { sparklinePoints } from "@/lib/eval-chart";
import { useDeltaLabel } from "@/lib/use-delta-label";
import { deltaColor, EVAL_METRIC_COLOR, formatMetric, progressLabel } from "@/lib/eval-format";
import { s } from "./styles";

const METRICS: { key: EvalMetricKey; label: "recall" | "precision" | "citation" }[] = [
  { key: "recall", label: "recall" },
  { key: "precision", label: "precision" },
  { key: "citation_accuracy", label: "citation" },
];
const W = 90;
const H = 28;

export function EvalMetricTiles({
  latest,
  previous,
  trend,
}: {
  latest: EvalSuiteRun;
  previous: EvalSuiteRun | null;
  trend?: EvalSuiteTrendPoint[];
}) {
  const m = useTranslations("eval.runDetail.metrics");
  const t = useTranslations("eval.agentView");
  const deltaLabel = useDeltaLabel();
  return (
    <div style={s.row}>
      {METRICS.map(({ key, label }) => {
        const now = latest[key];
        const before = previous?.[key];
        const delta = now != null && before != null ? now - before : null;
        const color = EVAL_METRIC_COLOR[key];
        const points = trend ? sparklinePoints(trend.map((p) => p[key]), W, H) : null;
        const text = formatMetric(now);
        return (
          <div key={key} style={s.tile}>
            <div style={s.top}>
              <div style={s.label}>{m(label)}</div>
              {points && (
                <svg width={W} height={H} aria-hidden="true">
                  <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
                </svg>
              )}
            </div>
            <div style={s.valueRow}>
              <span style={s.value(color)}>
                {text.endsWith("%") ? text.slice(0, -1) : text}
                {text.endsWith("%") && <span style={s.unit}>%</span>}
              </span>
              {previous && (
                <span style={s.delta(deltaColor(delta))} title={t("tiles.sinceLast")}>
                  {deltaLabel(delta)}
                </span>
              )}
            </div>
          </div>
        );
      })}
      <div style={s.tile}>
        <div style={s.label}>{m("passed")}</div>
        <div style={s.valueRow}>
          <span style={s.value("var(--text-primary)")}>{progressLabel(latest.traces_passed, latest.traces_total)}</span>
        </div>
      </div>
    </div>
  );
}
