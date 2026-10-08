"use client";

import { useTranslations } from "next-intl";
import type { EvalRecentRun } from "@devdigest/shared";
import { formatMetric, formatRunStamp, progressLabel } from "@/lib/eval-format";
import { recentFirst } from "../../helpers";

const TABLE = { width: "100%", borderCollapse: "collapse", fontSize: 13 } as const;
const TH = { textAlign: "left", padding: "8px 10px", fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", borderBottom: "1px solid var(--border)" } as const;
const TD = { padding: "8px 10px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" } as const;

/** Recent suite runs across all agents, newest first. */
export function RecentRunsTable({ runs }: { runs: EvalRecentRun[] }) {
  const t = useTranslations("eval.board");
  if (runs.length === 0) return <div style={{ ...TD, color: "var(--text-muted)" }}>{t("noRecent")}</div>;
  return (
    <table style={TABLE}>
      <thead>
        <tr>
          {(["agent", "ranAt", "version", "recall", "precision", "citation", "passed"] as const).map((c) => (
            <th key={c} style={TH}>
              {t(`columns.${c}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {recentFirst(runs).map((r) => (
          <tr key={r.id}>
            <td style={TD}>{r.agent_name}</td>
            <td style={TD}>{formatRunStamp(r.ran_at)}</td>
            <td style={TD}>v{r.agent_version ?? "—"}</td>
            {r.status === "running" ? (
              <td style={TD} colSpan={4}>
                {t("status.running")} · {progressLabel(r.cases_done, r.traces_total)}
              </td>
            ) : (
              <>
                <td style={TD}>{formatMetric(r.recall)}</td>
                <td style={TD}>{formatMetric(r.precision)}</td>
                <td style={TD}>{formatMetric(r.citation_accuracy)}</td>
                <td style={TD}>{progressLabel(r.traces_passed, r.traces_total)}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
