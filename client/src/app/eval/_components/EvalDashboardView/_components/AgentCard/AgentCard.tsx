"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalAgentCard } from "@devdigest/shared";
import { passRate, sparklinePoints } from "@/lib/eval-chart";
import { formatMetric, formatRunStamp } from "@/lib/eval-format";
import { METRIC_COLORS, s } from "./styles";

const W = 90;
const H = 32;

/** One agent that has cases, as a full-width row: latest run, pass-rate sparkline, three metrics; links to its view. */
export function AgentCard({ card }: { card: EvalAgentCard }) {
  const t = useTranslations("eval.board");
  const run = card.latest_run;
  const points = sparklinePoints(card.trend.map(passRate), W, H);
  const metrics = run
    ? ([
        ["recall", run.recall],
        ["precision", run.precision],
        ["citation", run.citation_accuracy],
      ] as const)
    : [];

  return (
    <Link href={`/eval/agents/${card.agent_id}`} style={s.row}>
      <span style={s.iconTile}>
        <Icon.Cpu size={18} />
      </span>
      <div style={s.main}>
        <div style={s.titleRow}>
          <span style={s.name}>{card.agent_name}</span>
          <span className="mono" style={s.modelChip}>
            {card.model}
          </span>
        </div>
        <div style={s.subline}>
          {run
            ? t("lastRun", {
                version: run.agent_version ?? "—",
                when: formatRunStamp(run.ran_at),
                passed: run.traces_passed,
                total: run.traces_total,
              })
            : `${t("noRunsYet")} · ${t("cases", { count: card.cases_total })}`}
        </div>
      </div>
      {points && (
        <svg width={W} height={H} role="img" aria-label={t("sparkline", { count: card.trend.length })}>
          <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
        </svg>
      )}
      <div style={s.metrics}>
        {metrics.map(([key, value]) => (
          <div key={key} style={s.metric}>
            <div style={s.metricLabel}>{t(`metricShort.${key}`)}</div>
            <div style={s.metricValue(METRIC_COLORS[key === "citation" ? "citation_accuracy" : key])}>{formatMetric(value)}</div>
          </div>
        ))}
      </div>
      <Icon.ChevronRight size={18} style={s.chevron} />
    </Link>
  );
}
