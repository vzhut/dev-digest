"use client";

import { useTranslations } from "next-intl";
import type { EvalMetricKey, EvalSuiteRun } from "@devdigest/shared";
import { formatDelta, formatMetric, progressLabel } from "@/lib/eval-format";

const ROW = { display: "flex", gap: 12, flexWrap: "wrap" } as const;
const TILE = { minWidth: 170, padding: "12px 16px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-elevated)" } as const;
const LABEL = { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" } as const;
const VALUE = { fontSize: 24, fontWeight: 600, margin: "2px 0" } as const;
const DELTA = { fontSize: 12.5, color: "var(--text-secondary)" } as const;

const METRICS: { key: EvalMetricKey; label: "recall" | "precision" | "citation" }[] = [
  { key: "recall", label: "recall" },
  { key: "precision", label: "precision" },
  { key: "citation_accuracy", label: "citation" },
];

/** Latest run's metrics, each with its change against the previous run (sign and arrow, not colour alone). */
export function MetricTiles({ latest, previous }: { latest: EvalSuiteRun; previous: EvalSuiteRun | null }) {
  const m = useTranslations("eval.runDetail.metrics");
  const t = useTranslations("eval.agentView");
  return (
    <div style={ROW}>
      {METRICS.map(({ key, label }) => {
        const now = latest[key];
        const before = previous?.[key];
        const delta = now != null && before != null ? now - before : null;
        return (
          <div key={key} style={TILE}>
            <div style={LABEL}>{m(label)}</div>
            <div style={VALUE}>{formatMetric(now)}</div>
            {previous && (
              <div style={DELTA} title={t("tiles.sinceLast")}>
                {formatDelta(delta)}
              </div>
            )}
          </div>
        );
      })}
      <div style={TILE}>
        <div style={LABEL}>{m("passed")}</div>
        <div style={VALUE}>{progressLabel(latest.traces_passed, latest.traces_total)}</div>
      </div>
    </div>
  );
}
