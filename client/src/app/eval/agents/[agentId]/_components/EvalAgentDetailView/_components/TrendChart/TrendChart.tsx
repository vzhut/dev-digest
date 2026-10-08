"use client";

import { useTranslations } from "next-intl";
import type { EvalSuiteTrendPoint } from "@devdigest/shared";
import { sparklinePoints } from "@/app/eval/helpers";

const W = 560;
const H = 120;
const SERIES = [
  { key: "recall", color: "var(--accent)" },
  { key: "precision", color: "var(--ok)" },
  { key: "citation_accuracy", color: "var(--warn)" },
] as const;

/** Recall / precision / citation over the runs as three inline-SVG lines (no chart library). */
export function TrendChart({ trend }: { trend: EvalSuiteTrendPoint[] }) {
  const t = useTranslations("eval.agentView");
  const m = useTranslations("eval.runDetail.metrics");
  const lines = SERIES.map((x) => ({ ...x, points: sparklinePoints(trend.map((p) => p[x.key]), W, H) }));
  if (trend.length < 2 || lines.every((l) => !l.points)) {
    return <div style={{ color: "var(--text-muted)", fontSize: 13 }}>{t("trendNeedsTwo")}</div>;
  }
  const names = { recall: m("recall"), precision: m("precision"), citation_accuracy: m("citation") };
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("trendLabel", { count: trend.length })}>
        {lines.map((l) => l.points && <polyline key={l.key} points={l.points} fill="none" stroke={l.color} strokeWidth={2} />)}
      </svg>
      <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--text-secondary)" }}>
        {lines.map((l) => (
          <span key={l.key}>
            <span style={{ color: l.color }}>●</span> {names[l.key]}
          </span>
        ))}
      </div>
    </div>
  );
}
