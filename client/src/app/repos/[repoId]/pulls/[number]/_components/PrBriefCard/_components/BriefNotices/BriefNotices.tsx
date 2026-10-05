"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { BriefMissingInput, PrBrief } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { shortSha, whenLabel } from "../../helpers";
import { s } from "../../styles";

/** Why a generation failed, in the user's words; the server reason is already short and secret-free. */
function useFailureReason(error: unknown): string {
  const t = useTranslations("brief");
  if (error instanceof ApiError) {
    if (error.code === "no_changes") return t("error.noChanges");
    if (error.code === "generation_in_progress") return t("error.inProgress");
    return error.message || t("error.fallback");
  }
  return t("error.fallback");
}

/** First failure (no stored brief) or failed regeneration (AC-37: the previous brief stays below). */
export function GenerationError({
  error,
  previous,
  onRetry,
  retrying,
}: {
  error: unknown;
  previous: PrBrief | null;
  onRetry: () => void;
  retrying: boolean;
}) {
  const t = useTranslations("brief");
  const reason = useFailureReason(error);
  const isConfig = error instanceof ApiError && error.code === "config_error";
  return (
    <div role="alert" style={s.errorBanner}>
      <span style={s.errorTitle}>
        {previous ? t("error.regenerationFailed", { reason }) : t("error.title")}
      </span>
      {!previous && <span>{reason}</span>}
      {previous && (
        <span>
          {t("error.previousBrief", {
            when: whenLabel(previous.generated_at),
            sha: shortSha(previous.head_sha),
          })}
        </span>
      )}
      {isConfig && (
        <span>
          {t("error.settingsHint")}{" "}
          <Link href="/settings" style={s.link}>
            {t("error.settingsLink")}
          </Link>
        </span>
      )}
      <div style={s.errorActions}>
        <Button size="sm" icon="RefreshCw" loading={retrying} disabled={retrying} onClick={onRetry}>
          {t("card.retry")}
        </Button>
      </div>
    </div>
  );
}

export function StaleNotice({ onRefresh, busy }: { onRefresh: () => void; busy: boolean }) {
  const t = useTranslations("brief");
  return (
    <div style={s.notice}>
      <span>{t("stale.notice")}</span>
      <Button size="sm" icon="RefreshCw" disabled={busy} onClick={onRefresh} title={t("refresh.tooltip")}>
        {t("stale.refresh")}
      </Button>
    </div>
  );
}

/** "Generated without: Intent (not derived yet), Blast radius (index not ready)". */
export function MissingInputs({ missing }: { missing: BriefMissingInput[] }) {
  const t = useTranslations("brief");
  if (missing.length === 0) return null;
  const parts = missing.map((m) => `${t(`missing.${m.input}`)} (${m.reason})`);
  return (
    <p style={s.muted}>
      {t("missing.prefix")} {parts.join(", ")}
    </p>
  );
}
