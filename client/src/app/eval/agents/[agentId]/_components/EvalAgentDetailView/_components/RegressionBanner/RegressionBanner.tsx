"use client";

import { useTranslations } from "next-intl";
import type { EvalRegression } from "@devdigest/shared";
import { formatDelta } from "@/lib/eval-format";

const BANNER = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid var(--crit)",
  background: "var(--crit-bg)",
  color: "var(--crit)",
  fontSize: 13,
} as const;

/** Names every metric that fell ≥ 0.05 since the previous run, with its drop (sign + arrow). */
export function RegressionBanner({ regression }: { regression: EvalRegression[] }) {
  const t = useTranslations("eval.agentView");
  if (regression.length === 0) return null;
  const items = regression.map((r) => `${t(`metricName.${r.metric}`)} ${formatDelta(-r.drop)}`).join(", ");
  return (
    <div role="alert" style={BANNER}>
      {t("regression", { items })}
    </div>
  );
}
