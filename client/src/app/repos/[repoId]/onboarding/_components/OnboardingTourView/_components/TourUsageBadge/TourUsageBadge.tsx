"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { TourUsage } from "@devdigest/shared";
import { usageParts } from "../../helpers";

/** "1 LLM call · 9,119 tok · $0.0012" with the model in the tooltip (AC-27, D3). */
export function TourUsageBadge({ usage }: { usage: TourUsage }) {
  const t = useTranslations("onboarding.page.usage");
  const parts = usageParts(usage);

  if (parts.calls === 0) {
    return (
      <span title={t("noneTooltip")}>
        <Badge>{t("none")}</Badge>
      </span>
    );
  }
  const label = [t("calls", { count: parts.calls }), parts.tokens, parts.cost].filter(Boolean).join(" · ");
  return (
    <span title={usage.model ? t("model", { model: usage.model }) : t("modelUnknown")}>
      <Badge>{label}</Badge>
    </span>
  );
}
