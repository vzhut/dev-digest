"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { Tour } from "@devdigest/shared";
import { isStale, partialSkipped } from "../../helpers";
import { useAgo } from "../../useAgo";
import { s } from "./styles";

function Banner({
  children,
  onRegenerate,
  busy,
}: {
  children: React.ReactNode;
  onRegenerate?: () => void;
  busy: boolean;
}) {
  const t = useTranslations("onboarding.page.actions");
  return (
    <div style={s.banner}>
      <Icon.AlertTriangle size={16} />
      <p style={s.text}>{children}</p>
      {onRegenerate && (
        <Button size="sm" kind="tertiary" disabled={busy} title={t("callTooltip")} onClick={onRegenerate}>
          {t("regenerate")}
        </Button>
      )}
    </div>
  );
}

/** Skeleton reason, partial-index, last-failed-regeneration and stale notices (AC-22, AC-23, AC-30). */
export function TourBanners({
  tour,
  indexSha,
  busy,
  onRegenerate,
}: {
  tour: Tour;
  indexSha: string | null;
  busy: boolean;
  onRegenerate: () => void;
}) {
  const t = useTranslations("onboarding.page.banners");
  const ago = useAgo();
  const skipped = partialSkipped(tour.index);
  const last = tour.last_attempt;

  return (
    <div style={s.stack}>
      {tour.mode === "skeleton" && (
        <Banner busy={busy} onRegenerate={onRegenerate}>
          {t(`skeleton.${tour.skeleton_reason ?? "llm_failed"}`, {
            status: tour.index.status,
            detail: tour.skeleton_detail ?? t("unknownReason"),
          })}
        </Banner>
      )}
      {tour.mode === "llm" && skipped !== null && <Banner busy={busy}>{t("partial", { count: skipped })}</Banner>}
      {last && (
        <Banner busy={busy}>
          {t("lastAttempt", { ago: ago(last.at), reason: last.detail ?? t(`reason.${last.skeleton_reason}`) })}
        </Banner>
      )}
      {isStale(tour, indexSha) && (
        <Banner busy={busy} onRegenerate={onRegenerate}>
          {t("stale")}
        </Banner>
      )}
    </div>
  );
}
