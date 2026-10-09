/* EvalRunHistory — an agent's suite runs, newest first. Shared by the Evals tab and the per-agent
   dashboard (two routes), hence in components/. Optional row selection feeds Compare. */
"use client";

import { useTranslations } from "next-intl";
import type { EvalSuiteRun } from "@devdigest/shared";
import { Icon } from "@devdigest/ui";
import { EvalMetricBar } from "@/components/eval-metric-bar";
import { EVAL_METRIC_COLOR, formatRunCost, formatRunStamp } from "@/lib/eval-format";
import { newestFirst } from "./helpers";
import { s } from "./styles";

export function EvalRunHistory({
  runs,
  selectable = false,
  selectedIds = [],
  onToggle,
}: {
  runs: EvalSuiteRun[];
  selectable?: boolean;
  selectedIds?: string[];
  onToggle?: (runId: string) => void;
}) {
  const t = useTranslations("eval.runHistory");
  if (runs.length === 0) return <div style={s.empty}>{t("empty")}</div>;

  return (
    <div style={s.box}>
      <table style={s.table} aria-label={t("tableLabel")}>
        <thead>
          <tr>
            {selectable && <th style={s.th} aria-label={t("columns.select")} />}
            <th style={s.th}>{t("columns.ranAt")}</th>
            <th style={s.th}>{t("columns.version")}</th>
            <th style={s.th}>{t("columns.recall")}</th>
            <th style={s.th}>{t("columns.precision")}</th>
            <th style={s.th}>{t("columns.citation")}</th>
            <th style={s.th}>{t("columns.pass")}</th>
            <th style={s.th}>{t("columns.cost")}</th>
          </tr>
        </thead>
        <tbody>
          {newestFirst(runs).map((run) => {
            const stamp = formatRunStamp(run.ran_at);
            const version = run.agent_version ?? "—";
            const running = run.status === "running";
            return (
              <tr key={run.id} style={s.row(selectedIds.includes(run.id))}>
                {selectable && (
                  <td style={s.td}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={selectedIds.includes(run.id)}
                      aria-label={t("selectRun", { version, stamp })}
                      onClick={() => onToggle?.(run.id)}
                      style={s.checkbox(selectedIds.includes(run.id))}
                    >
                      {selectedIds.includes(run.id) && <Icon.Check size={11} style={s.check} />}
                    </button>
                  </td>
                )}
                <td className="mono" style={{ ...s.td, ...s.when }}>
                  {stamp}
                </td>
                <td className="mono" style={{ ...s.td, ...s.version }}>
                  v{version}
                </td>
                {running ? (
                  <td style={s.td} colSpan={3}>
                    {t("progress", { done: run.cases_done, total: run.traces_total })}
                  </td>
                ) : run.status === "errored" ? (
                  <td style={{ ...s.td, ...s.muted }} colSpan={3}>
                    {t("errored")}
                    {run.error_reason ? `: ${run.error_reason}` : ""}
                  </td>
                ) : (
                  <>
                    <td style={s.td}>
                      <EvalMetricBar value={run.recall} color={EVAL_METRIC_COLOR.recall} />
                    </td>
                    <td style={s.td}>
                      <EvalMetricBar value={run.precision} color={EVAL_METRIC_COLOR.precision} />
                    </td>
                    <td style={s.td}>
                      <EvalMetricBar value={run.citation_accuracy} color={EVAL_METRIC_COLOR.citation_accuracy} />
                    </td>
                  </>
                )}
                <td style={{ ...s.td, ...s.passed }}>{running ? "" : `${run.traces_passed}/${run.traces_total}`}</td>
                <td className="mono" style={{ ...s.td, ...s.cost }} title={run.cost_partial ? t("partialCostHint") : undefined}>
                  {running ? "" : formatRunCost(run.cost_usd, run.cost_partial)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
