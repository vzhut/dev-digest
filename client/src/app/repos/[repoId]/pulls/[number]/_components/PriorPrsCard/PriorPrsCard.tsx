/* PriorPrsCard — merged PRs that previously touched the same files as this
   PR, from GitHub commit history (Design "Prior PRs", T13's
   `PrHistoryService`). Sits on the Overview tab, below BlastRadiusCard. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { usePrHistory } from "@/lib/hooks/blast";
import { apiErrorMessage } from "@/lib/api";
import { relativeTime } from "@/lib/relative-time";
import { priorPrHref, priorPrLabel } from "./helpers";
import { s } from "./styles";

export function PriorPrsCard({
  prId,
  repoFullName,
}: {
  prId: string | null;
  repoFullName: string | null;
}) {
  const t = useTranslations("blast");
  const { data, isLoading, isError, error, refetch } = usePrHistory(prId);

  if (isLoading) {
    return (
      <section aria-label={t("history.title")} aria-busy="true" style={{ ...s.card, ...s.skeleton }}>
        <Skeleton height={16} width={220} />
        <Skeleton height={40} />
      </section>
    );
  }

  if (isError) {
    return (
      <section aria-label={t("history.title")} style={s.card}>
        <ErrorState
          title={t("history.title")}
          body={apiErrorMessage(error, t("history.error"))}
          onRetry={() => refetch()}
        />
      </section>
    );
  }

  if (!data) return null;

  return (
    <section aria-label={t("history.title")} style={s.card}>
      <span style={s.title}>{t("history.title")}</span>

      {data.degraded && data.reason ? (
        <p role="status" style={s.empty}>
          {t(`history.degraded.${data.reason}`)}
        </p>
      ) : data.history.length === 0 ? (
        <p style={s.empty}>{t("history.empty")}</p>
      ) : (
        <ul style={s.list}>
          {data.history.map((item) => {
            const href = priorPrHref(repoFullName, item.pr_number);
            const label = priorPrLabel(item);
            return (
              <li key={item.pr_number} style={s.item}>
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer" style={s.itemLink}>
                    {label}
                  </a>
                ) : (
                  <span style={s.itemText}>{label}</span>
                )}
                <span style={s.meta}>
                  {item.author} · {relativeTime(item.merged_at)} ·{" "}
                  {t("history.overlap", { count: item.files_overlap.length })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
