"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalRegression } from "@devdigest/shared";
import { formatDelta } from "@/lib/eval-format";

const BANNER = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 16px",
  borderRadius: 8,
  border: "1px solid var(--warn)",
  background: "var(--warn-bg)",
  fontSize: 14,
} as const;

/** Names every metric that fell ≥ 0.05 since the previous run, with its drop (sign + arrow). */
export function RegressionBanner({ regression }: { regression: EvalRegression[] }) {
  const t = useTranslations("eval.agentView");
  if (regression.length === 0) return null;
  const items = regression.map((r) => `${t(`metricName.${r.metric}`)} ${formatDelta(-r.drop)}`).join(", ");
  return (
    <div role="alert" style={BANNER}>
      <Icon.AlertTriangle size={16} style={{ color: "var(--warn)", flexShrink: 0 }} />
      <span>{t("regression", { items })}</span>
    </div>
  );
}
