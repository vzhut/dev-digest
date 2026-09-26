"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge } from "@devdigest/ui";
import type { PrIntentRecord } from "@devdigest/shared";
import { hasFixedLabel, riskAreasOf, sourceSummary } from "../../helpers";
import { s } from "../../styles";

/** The loaded intent: quoted summary, scope columns, risk chips, sources, missing context and notices. */
export function IntentBody({ intent }: { intent: PrIntentRecord }) {
  const t = useTranslations("prReview");
  const risks = riskAreasOf(intent);
  const { loaded, unavailable } = sourceSummary(intent.sources);
  const sourceLabel = (src: PrIntentRecord["sources"][number]) =>
    hasFixedLabel(src) ? t(`intent.sourceKind.${src.kind}`) : src.ref;

  return (
    <>
      <blockquote style={s.summary}>{intent.intent}</blockquote>

      <div style={s.columns}>
        <div>
          <div style={s.label}>{t("intent.inScope")}</div>
          {intent.in_scope.length === 0 ? (
            <span style={s.none}>{t("intent.none")}</span>
          ) : (
            <ul role="list" aria-label={t("intent.inScopeList", { count: intent.in_scope.length })} style={s.list}>
              {intent.in_scope.map((item, i) => (
                <li key={i} style={s.item}>
                  <Icon.Check size={14} style={s.itemIn} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div style={s.label}>{t("intent.outOfScope")}</div>
          {intent.out_of_scope.length === 0 ? (
            <span style={s.none}>{t("intent.none")}</span>
          ) : (
            <ul
              role="list"
              aria-label={t("intent.outOfScopeList", { count: intent.out_of_scope.length })}
              style={s.list}
            >
              {intent.out_of_scope.map((item, i) => (
                <li key={i} style={s.item}>
                  <Icon.X size={14} style={s.itemOut} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {risks.length > 0 && (
        <div>
          <div style={s.label}>{t("intent.riskAreas")}</div>
          <div style={s.chips}>
            {risks.map((r) => (
              <Badge key={r} color="var(--warn)" bg="var(--warn-bg)">
                {r}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div style={s.sourcesRow}>
        <span>{t("intent.sources")}: </span>
        {loaded.map((src, i) => (
          <span key={`${src.kind}:${src.ref}`}>
            {i > 0 && " · "}
            {sourceLabel(src)}
            {src.status === "truncated" && ` (${t("intent.sourceStatus.truncated")})`}
          </span>
        ))}
        {unavailable.map((src) => (
          <span key={`${src.kind}:${src.ref}`} style={s.sourceUnavailable}>
            {" · "}
            {sourceLabel(src)} ({t(`intent.sourceStatus.${src.status}`)}
            {src.reason ? ` — ${src.reason}` : ""})
          </span>
        ))}
      </div>

      {intent.missing_context.length > 0 && (
        <div style={s.notice} role="status">
          <Icon.AlertTriangle size={15} style={s.noticeIcon} />
          <div>
            <strong>{t("intent.missing")}</strong>
            <ul style={s.missingList}>
              {intent.missing_context.map((m, i) => (
                <li key={`${i}:${m}`}>{m}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {intent.confidence === "low" && (
        <div style={s.notice} role="status">
          <Icon.AlertTriangle size={15} style={s.noticeIcon} />
          <span>{t("intent.lowConfidenceNote")}</span>
        </div>
      )}

      {intent.stale && (
        <div style={s.notice} role="status">
          <Icon.RefreshCw size={15} style={s.noticeIcon} />
          <span>{t("intent.stale")}</span>
        </div>
      )}
    </>
  );
}
