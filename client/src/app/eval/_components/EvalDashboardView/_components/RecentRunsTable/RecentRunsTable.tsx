"use client";

import { useTranslations } from "next-intl";
import type { EvalRecentRun } from "@devdigest/shared";
import { EvalMetricBar } from "@/components/eval-metric-bar";
import { EVAL_METRIC_COLOR, formatRunStamp, progressLabel } from "@/lib/eval-format";
import { recentFirst } from "../../helpers";
import { s } from "./styles";

const COLUMNS = ["agent", "ranAt", "version", "recall", "precision", "citation", "passed"] as const;

/** Recent suite runs across all agents, newest first: metric bars with the percentage, bold pass count. */
export function RecentRunsTable({ runs }: { runs: EvalRecentRun[] }) {
  const t = useTranslations("eval.board");
  if (runs.length === 0) return <div style={s.empty}>{t("noRecent")}</div>;
  return (
    <div style={s.box}>
      <table style={s.table}>
        <thead style={s.srOnly}>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c}>{t(`columns.${c}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {recentFirst(runs).map((r) => (
            <tr key={r.id}>
              <td style={{ ...s.td, ...s.first, ...s.agent }}>{r.agent_name}</td>
              <td className="mono" style={{ ...s.td, ...s.when }}>
                {formatRunStamp(r.ran_at)}
              </td>
              <td className="mono" style={{ ...s.td, ...s.version }}>
                v{r.agent_version ?? "—"}
              </td>
              {r.status === "running" ? (
                <td style={s.td} colSpan={3}>
                  {t("status.running")} · {progressLabel(r.cases_done, r.traces_total)}
                </td>
              ) : (
                <>
                  <td style={s.td}>
                    <EvalMetricBar value={r.recall} color={EVAL_METRIC_COLOR.recall} />
                  </td>
                  <td style={s.td}>
                    <EvalMetricBar value={r.precision} color={EVAL_METRIC_COLOR.precision} />
                  </td>
                  <td style={s.td}>
                    <EvalMetricBar value={r.citation_accuracy} color={EVAL_METRIC_COLOR.citation_accuracy} />
                  </td>
                </>
              )}
              <td style={{ ...s.td, ...s.passed }}>{r.status === "running" ? "" : `${r.traces_passed}/${r.traces_total}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
