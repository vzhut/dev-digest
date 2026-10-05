"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { Tour } from "@devdigest/shared";
import { coverageOf, repoShortName } from "../../helpers";
import { useAgo } from "../../useAgo";
import { TourUsageBadge } from "../TourUsageBadge";
import { s } from "./styles";

/** Title, "generated from index of N files" subtitle, usage badge and the Regenerate / Share actions. */
export function TourHeader({
  tour,
  repoFullName,
  generating,
  onRegenerate,
  onShare,
}: {
  tour: Tour;
  repoFullName: string;
  generating: boolean;
  onRegenerate: () => void;
  onShare: () => void;
}) {
  const t = useTranslations("onboarding.page");
  const ago = useAgo();
  const coverage = coverageOf(tour.index);
  const files =
    coverage.kind === "bounded"
      ? t("files.ofTotal", { n: String(coverage.n), m: String(coverage.m) })
      : t("files.plain", { count: coverage.n });

  return (
    <header style={s.header}>
      <div style={s.titleBlock}>
        <h1 style={s.title}>
          {t("heading")} <span className="mono" style={s.repo}>{repoShortName(repoFullName)}</span>
        </h1>
        <p style={s.subtitle}>
          {t("subtitle", { files, when: t("generatedAgo", { ago: ago(tour.generated_at) }) })}
        </p>
        {coverage.kind === "bounded" && (
          <p style={s.note}>{t("coverage.bounded", { n: String(coverage.n), m: String(coverage.m) })}</p>
        )}
        {coverage.kind === "unknown" && <p style={s.note}>{t("coverage.unknown")}</p>}
      </div>
      <div style={s.actions}>
        <TourUsageBadge usage={tour.usage} />
        <Button
          icon="RefreshCw"
          size="sm"
          loading={generating}
          disabled={generating}
          title={t("actions.callTooltip")}
          onClick={onRegenerate}
        >
          {t("actions.regenerate")}
        </Button>
        <Button icon="Link" size="sm" onClick={onShare}>
          {t("actions.share")}
        </Button>
      </div>
    </header>
  );
}
