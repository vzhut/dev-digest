"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { BarRow, Badge, EmptyState, MetricCard } from "@devdigest/ui";
import { useSkillStats } from "@/lib/hooks/skills";
import { formatAcceptRate, hasNoRuns, maxCategoryCount } from "./helpers";
import { s } from "./styles";

/** Stats tab — only real numbers; attribution is run-level (see specs/skills.md §6.3). */
export function StatsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills.stats");
  const { data: stats, isLoading, isError } = useSkillStats(skillId);

  if (isLoading) return null;
  if (isError || !stats) return <div style={s.root}>{t("loadError")}</div>;

  const max = maxCategoryCount(stats.findings_by_category);
  const noRuns = hasNoRuns(stats);
  const acceptRate = formatAcceptRate(stats.accept_rate);

  return (
    <div style={s.root}>
      <div style={s.tiles}>
        <MetricCard label={t("usedBy")} value={t("usedByValue", { count: stats.used_by })} />
      </div>

      <div>
        <div style={s.sectionLabel}>{t("agentsUsing")}</div>
        {stats.agents.length === 0 ? (
          <div style={s.muted}>{t("noAgents")}</div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {stats.agents.map((a) => (
              <li key={a.id} style={s.agentRow}>
                <span>{a.name}</span>
                <Badge dot color={a.enabled ? "var(--ok)" : "var(--text-muted)"}>
                  {a.enabled ? t("agentEnabled") : t("agentDisabled")}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      {noRuns ? (
        <EmptyState icon="Activity" title={t("empty.title")} body={t("empty.body")} />
      ) : (
        <>
          <div style={s.tiles}>
            <MetricCard label={t("runs")} value={stats.runs_30d} />
            <MetricCard label={t("findings")} value={stats.findings_30d} />
            <MetricCard label={t("acceptRate")} value={acceptRate ?? t("unknown")} />
          </div>
          <p style={s.caveat}>{"⚠️ " + t("caveat")}</p>
          {stats.findings_by_category.length > 0 && (
            <div>
              <div style={s.sectionLabel}>{t("byCategory")}</div>
              {stats.findings_by_category.map((c) => (
                <BarRow
                  key={c.category}
                  label={c.category}
                  value={c.count}
                  max={max}
                  suffix={String(c.count)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
