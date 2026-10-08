"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { EvalAgentCard } from "@devdigest/shared";
import { formatMetric, progressLabel } from "@/lib/eval-format";
import { relativeTime } from "@/lib/relative-time";
import { passRate, sparklinePoints } from "@/app/eval/helpers";
import { s } from "./styles";

const W = 90;
const H = 28;

/** One agent that has cases: latest metrics, p / n, a pass-rate sparkline; the whole card links to its view. */
export function AgentCard({ card }: { card: EvalAgentCard }) {
  const t = useTranslations("eval.board");
  const m = useTranslations("eval.runDetail.metrics");
  const run = card.latest_run;
  const points = sparklinePoints(card.trend.map(passRate), W, H);

  return (
    <Link href={`/eval/agents/${card.agent_id}`} style={s.card}>
      <div>
        <div style={s.name}>{card.agent_name}</div>
        <div style={s.meta} className="mono">
          {card.model} · {t("cases", { count: card.cases_total })}
        </div>
      </div>
      {run ? (
        <>
          <div style={s.metrics}>
            {(
              [
                [m("recall"), run.recall],
                [m("precision"), run.precision],
                [m("citation"), run.citation_accuracy],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <div style={s.metricLabel}>{label}</div>
                <div style={s.metricValue}>{formatMetric(value)}</div>
              </div>
            ))}
          </div>
          <div style={s.footer}>
            <span>
              {t("latest", { version: run.agent_version ?? "—", when: relativeTime(run.ran_at) })} ·{" "}
              {progressLabel(run.traces_passed, run.traces_total)}
            </span>
            {points && (
              <svg width={W} height={H} role="img" aria-label={t("sparkline", { count: card.trend.length })}>
                <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
              </svg>
            )}
          </div>
        </>
      ) : (
        <div style={s.meta}>{t("noRunsYet")}</div>
      )}
    </Link>
  );
}
