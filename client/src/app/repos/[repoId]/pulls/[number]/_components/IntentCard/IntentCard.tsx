"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { usePrIntent, useRerunIntent } from "@/lib/hooks/reviews";
import { apiErrorMessage } from "@/lib/api";
import { IntentBody } from "./_components/IntentBody";
import { confidenceTone, formatIntentMeta } from "./helpers";
import { s } from "./styles";

/**
 * What the PR is meant to change, as understood by the intent classifier — shown
 * before the review results so the reader can check the model's understanding.
 */
export function IntentCard({ prId }: { prId: string | null }) {
  const t = useTranslations("prReview");
  const { data, isLoading, isError, error, refetch } = usePrIntent(prId);
  const rerun = useRerunIntent(prId);
  const intent = data?.intent ?? null;

  if (isLoading) {
    return (
      <section aria-label={t("intent.title")} aria-busy="true" style={{ ...s.card, ...s.skeleton }}>
        <Skeleton height={16} width={280} />
        <Skeleton height={60} />
      </section>
    );
  }

  if (isError) {
    return (
      <section aria-label={t("intent.title")} style={s.card}>
        <ErrorState
          title={t("intent.errorTitle")}
          body={apiErrorMessage(error, t("intent.errorBody"))}
          onRetry={() => refetch()}
        />
      </section>
    );
  }

  if (!intent) {
    return (
      <section aria-label={t("intent.title")} style={s.card}>
        <EmptyState
          icon="Sparkles"
          title={t("intent.emptyTitle")}
          body={t("intent.emptyBody")}
          cta={t("intent.detect")}
          onCta={() => rerun.mutate()}
          ctaLoading={rerun.isPending}
        />
        {rerun.isError && (
          <div role="alert" style={s.rerunError}>
            {apiErrorMessage(rerun.error, t("intent.rerunError"))}
          </div>
        )}
      </section>
    );
  }

  const tone = confidenceTone(intent.confidence);
  const meta = formatIntentMeta(intent);

  return (
    <section aria-label={t("intent.title")} style={s.card}>
      <div style={s.header}>
        <span style={s.title}>{t("intent.title")}</span>
        <Badge color={tone.color} bg={tone.bg}>
          {t("intent.confidenceLabel", { level: t(`intent.confidence.${intent.confidence}`) })}
        </Badge>
        {meta.model && <span style={s.meta}>{t("intent.meta", { model: meta.model, cost: meta.cost })}</span>}
        <span style={s.headerSpacer} />
        <Button
          kind="ghost"
          size="sm"
          icon="RefreshCw"
          loading={rerun.isPending}
          disabled={rerun.isPending}
          onClick={() => rerun.mutate()}
        >
          {t("intent.rerun")}
        </Button>
      </div>
      {rerun.isError && (
        <div role="alert" style={s.rerunError}>
          {apiErrorMessage(rerun.error, t("intent.rerunError"))}
        </div>
      )}
      <IntentBody intent={intent} />
    </section>
  );
}
