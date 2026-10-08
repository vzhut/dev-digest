/* EvalRunHistory — an agent's suite runs, newest first. Shared by the Evals tab and the per-agent
   dashboard (two routes), hence in components/. Optional row selection feeds Compare. */
"use client";

import { useTranslations } from "next-intl";
import type { EvalSuiteRun } from "@devdigest/shared";
import { formatMetric, formatRunCost, formatRunStamp, progressLabel } from "@/lib/eval-format";
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
    <table style={s.table} aria-label={t("tableLabel")}>
      <thead>
        <tr>
          {selectable && <th style={s.th}>{t("columns.select")}</th>}
          <th style={s.th}>{t("columns.ranAt")}</th>
          <th style={s.th}>{t("columns.version")}</th>
          <th style={s.th}>{t("columns.recall")}</th>
          <th style={s.th}>{t("columns.precision")}</th>
          <th style={s.th}>{t("columns.citation")}</th>
          <th style={s.th}>{t("columns.passed")}</th>
          <th style={s.th}>{t("columns.cost")}</th>
        </tr>
      </thead>
      <tbody>
        {newestFirst(runs).map((run) => {
          const stamp = formatRunStamp(run.ran_at);
          const version = run.agent_version ?? "—";
          const running = run.status === "running";
          return (
            <tr key={run.id}>
              {selectable && (
                <td style={s.td}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(run.id)}
                    onChange={() => onToggle?.(run.id)}
                    aria-label={t("selectRun", { version, stamp })}
                  />
                </td>
              )}
              <td style={s.td}>{stamp}</td>
              <td style={s.td}>v{version}</td>
              {running ? (
                <td style={s.td} colSpan={4}>
                  {t("progress", { done: run.cases_done, total: run.traces_total })}
                </td>
              ) : run.status === "errored" ? (
                <td style={{ ...s.td, ...s.muted }} colSpan={4}>
                  {t("errored")}
                  {run.error_reason ? `: ${run.error_reason}` : ""}
                </td>
              ) : (
                <>
                  <td style={s.td}>{formatMetric(run.recall)}</td>
                  <td style={s.td}>{formatMetric(run.precision)}</td>
                  <td style={s.td}>{formatMetric(run.citation_accuracy)}</td>
                  <td style={s.td}>{progressLabel(run.traces_passed, run.traces_total)}</td>
                </>
              )}
              {!running && (
                <td style={s.td} title={run.cost_partial ? t("partialCostHint") : undefined}>
                  {formatRunCost(run.cost_usd, run.cost_partial)}
                </td>
              )}
              {running && <td style={s.td} />}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
