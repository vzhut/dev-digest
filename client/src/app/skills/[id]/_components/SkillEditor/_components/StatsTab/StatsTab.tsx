"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Donut, EmptyState, Icon } from "@devdigest/ui";
import { useSkillStats } from "@/lib/hooks/skills";
import { categorySegments, formatAcceptRate, hasNoRuns } from "./helpers";
import { s } from "./styles";

const RING = 34;

/** Small circular ring showing a 0..1 rate. */
function AcceptRing({ rate }: { rate: number }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  const pct = Math.round(rate * 100);
  return (
    <svg width={RING} height={RING} viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r={r} fill="none" stroke="var(--border)" strokeWidth="3" />
      <circle
        cx="17"
        cy="17"
        r={r}
        fill="none"
        stroke="var(--warn)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${c * rate} ${c}`}
        transform="rotate(-90 17 17)"
      />
      <text x="17" y="20" textAnchor="middle" style={s.ringText}>
        {pct}
      </text>
    </svg>
  );
}

function Tile({ label, ring, children }: { label: string; ring?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={s.tile}>
      <div style={s.tileHead}>
        <span style={s.tileLabel}>{label}</span>
        {ring}
      </div>
      <div className="tnum" style={s.tileValue}>
        {children}
      </div>
    </div>
  );
}

/** Stats tab — only real numbers; attribution is run-level (see specs/skills.md §6.3). */
export function StatsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills.stats");
  const { data: stats, isLoading, isError } = useSkillStats(skillId);

  if (isLoading) return null;
  if (isError || !stats) return <div style={s.root}>{t("loadError")}</div>;

  const noRuns = hasNoRuns(stats);
  const acceptRate = formatAcceptRate(stats.accept_rate);

  return (
    <div style={s.root}>
      <div style={s.tiles}>
        <Tile label={t("usedBy")}>{t("usedByValue", { count: stats.used_by })}</Tile>
        {!noRuns && (
          <>
            <Tile
              label={t("acceptRate")}
              ring={stats.accept_rate != null && acceptRate ? <AcceptRing rate={stats.accept_rate} /> : undefined}
            >
              {acceptRate ?? t("unknown")}
            </Tile>
            <Tile label={t("findings")}>{stats.findings_30d}</Tile>
            <Tile label={t("runs")}>{stats.runs_30d}</Tile>
          </>
        )}
      </div>

      <div style={s.panels}>
        <div style={s.panel}>
          <div style={s.panelHead}>
            <Icon.Cpu size={14} />
            {t("agentsUsing")}
          </div>
          {stats.agents.length === 0 ? (
            <div style={s.muted}>{t("noAgents")}</div>
          ) : (
            <ul style={s.agentList}>
              {stats.agents.map((a) => (
                <li key={a.id} style={s.agentRow}>
                  <span style={s.agentIcon}>
                    <Icon.Cpu size={14} />
                  </span>
                  <span style={s.agentName}>{a.name}</span>
                  <span style={s.state(a.enabled)}>{a.enabled ? t("agentEnabled") : t("agentDisabled")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!noRuns && stats.findings_by_category.length > 0 && (
          <div style={s.panel}>
            <div style={s.panelHead}>
              <Icon.Tag size={14} />
              {t("byCategory")}
            </div>
            <Donut segments={categorySegments(stats.findings_by_category)} formatValue={String} />
          </div>
        )}
      </div>

      {noRuns ? (
        <EmptyState icon="Activity" title={t("empty.title")} body={t("empty.body")} />
      ) : (
        <p style={s.caveat}>{"⚠️ " + t("caveat")}</p>
      )}
    </div>
  );
}
