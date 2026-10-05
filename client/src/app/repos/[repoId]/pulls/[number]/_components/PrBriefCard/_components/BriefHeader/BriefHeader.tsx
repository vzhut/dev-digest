"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { BriefUsage } from "@devdigest/shared";
import { formatBriefUsage } from "../../helpers";
import { s } from "../../styles";

export function BriefHeader({
  usage,
  model,
  canRefresh,
  busy,
  onRefresh,
}: {
  usage: BriefUsage | null | undefined;
  model: string | null | undefined;
  /** False while there is no stored brief: the Generate button of the empty state is the only action. */
  canRefresh: boolean;
  busy: boolean;
  onRefresh: () => void;
}) {
  const t = useTranslations("brief");
  return (
    <div style={s.header}>
      <span style={s.title}>{t("card.title")}</span>
      <span style={s.spacer} />
      {usage && (
        <span
          className="mono tnum"
          style={s.usage}
          aria-label={t("usage.label")}
          title={t("usage.modelTooltip", { model: model ?? t("usage.unknownModel") })}
        >
          {formatBriefUsage(usage)}
        </span>
      )}
      {canRefresh && (
        <Button
          kind="ghost"
          size="sm"
          icon="RefreshCw"
          loading={busy}
          disabled={busy}
          aria-label={t("refresh.label")}
          title={t("refresh.tooltip")}
          onClick={onRefresh}
        />
      )}
    </div>
  );
}
