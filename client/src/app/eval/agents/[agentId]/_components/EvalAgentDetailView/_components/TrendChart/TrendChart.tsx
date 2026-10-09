"use client";

import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import type { EvalSuiteTrendPoint } from "@devdigest/shared";
import { sparklinePoints } from "@/lib/eval-chart";
import { EVAL_METRIC_COLOR } from "@/lib/eval-format";

const W = 1000;
const H = 220;
const PADY = 12; // room for the top/bottom tick labels
const LEFT = 36;
const SERIES = [
  { key: "recall", color: EVAL_METRIC_COLOR.recall },
  { key: "precision", color: EVAL_METRIC_COLOR.precision },
  { key: "citation_accuracy", color: EVAL_METRIC_COLOR.citation_accuracy },
] as const;

const BOX = { border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-surface)", padding: "18px 22px" } as const;
const LEGEND = { display: "flex", gap: 16, fontSize: 12.5, color: "var(--text-secondary)" } as const;

/** Recall / precision / citation over the runs as three inline-SVG lines on a 0.1-gridded axis (no chart library). */
export function TrendChart({ trend }: { trend: EvalSuiteTrendPoint[] }) {
  const t = useTranslations("eval.agentView");
  const m = useTranslations("eval.runDetail.metrics");
  const names = { recall: m("recall"), precision: m("precision"), citation_accuracy: m("citation") };
  const values = SERIES.flatMap((x) => trend.map((p) => p[x.key]).filter((v): v is number => v != null));
  const enough = trend.length >= 2 && values.length >= 2;
  // axis from a round-tenth below the lowest value up to 1.0
  const lo = enough ? Math.max(0, Math.floor((Math.min(...values) - 0.05) * 10) / 10) : 0;
  const ticks: number[] = [];
  for (let v = lo; v <= 1.0001; v += 0.1) ticks.push(Math.round(v * 10) / 10);
  const plotW = W - LEFT;
  const y = (v: number) => PADY + (1 - (v - lo) / (1 - lo)) * (H - 2 * PADY);

  return (
    <section style={BOX}>
      <SectionLabel
        icon="TrendingUp"
        right={
          <div style={LEGEND}>
            {SERIES.map((x) => (
              <span key={x.key}>
                <span style={{ color: x.color }}>━</span> {names[x.key]}
              </span>
            ))}
          </div>
        }
      >
        {t("trendHeading")}
      </SectionLabel>
      {!enough ? (
        <div style={{ color: "var(--text-muted)", fontSize: 13 }}>{t("trendNeedsTwo")}</div>
      ) : (
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("trendLabel", { count: trend.length })}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={LEFT} x2={W} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
              <text x={0} y={y(v) + 4} fontSize={11} fill="var(--text-muted)" className="mono">
                {v.toFixed(1)}
              </text>
            </g>
          ))}
          {SERIES.map((x) => {
            const points = sparklinePoints(trend.map((p) => p[x.key]), plotW, H - 2 * PADY + 4, lo, 1) // sparklinePoints pads by 2;
            if (!points) return null;
            const shifted = points
              .split(" ")
              .map((pt) => {
                const [px, py] = pt.split(",").map(Number);
                return `${(px! + LEFT).toFixed(1)},${(py! + PADY - 2).toFixed(1)}`;
              })
              .join(" ");
            const last = shifted.split(" ").at(-1)!.split(",");
            return (
              <g key={x.key}>
                <polyline points={shifted} fill="none" stroke={x.color} strokeWidth={2} />
                <circle cx={last[0]} cy={last[1]} r={3.5} fill={x.color} />
              </g>
            );
          })}
        </svg>
      )}
    </section>
  );
}
