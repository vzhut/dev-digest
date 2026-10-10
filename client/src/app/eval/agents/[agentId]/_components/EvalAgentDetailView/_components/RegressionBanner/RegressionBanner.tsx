"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalRegression } from "@devdigest/shared";
import { useDeltaLabel } from "@/lib/use-delta-label";
import { s } from "./styles";

/** Names every metric that fell ≥ 0.05 since the previous run, with its drop (sign + arrow). */
export function RegressionBanner({ regression }: { regression: EvalRegression[] }) {
  const t = useTranslations("eval.agentView");
  const deltaLabel = useDeltaLabel();
  if (regression.length === 0) return null;
  const items = regression.map((r) => `${t(`metricName.${r.metric}`)} ${deltaLabel(-r.drop)}`).join(", ");
  return (
    <div role="alert" style={s.banner}>
      <Icon.AlertTriangle size={16} style={s.icon} />
      <span>{t("regression", { items })}</span>
    </div>
  );
}
