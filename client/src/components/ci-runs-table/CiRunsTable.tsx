/* CiRunsTable — the CI runs list shared by the agent's CI tab and the CI Runs page: repository, PR link,
   agent, verdict / status, findings by severity, cost, duration and the GitHub job link. Pure view: the
   caller fetches, filters and orders the rows. */
"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { CiRunItem } from "@devdigest/shared";
import { formatCostUsd, UNKNOWN } from "@/lib/format-cost";
import { formatDuration, formatRunStamp } from "@/lib/eval-format";
import { hasBreakdown, RESULT_COLOR, resultOf, safeHttpsUrl } from "./helpers";
import { s } from "./styles";

const COLUMNS = ["timestamp", "repository", "pullRequest", "agent", "status", "findings", "cost", "duration", "job"] as const;

export function CiRunsTable({ runs }: { runs: CiRunItem[] }) {
  const t = useTranslations("ci.runs");
  return (
    <div style={s.box}>
      <table style={s.table}>
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c} scope="col" style={s.th}>
                {t(`table.${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const result = resultOf(r);
            const prUrl = safeHttpsUrl(r.pr_url);
            const jobUrl = safeHttpsUrl(r.job_url);
            return (
              <tr key={r.id}>
                <td className="mono" style={{ ...s.td, ...s.nowrap, ...s.muted }}>
                  {formatRunStamp(r.ran_at)}
                </td>
                <td className="mono" style={{ ...s.td, ...s.nowrap }}>
                  {r.repo}
                </td>
                <td style={{ ...s.td, ...s.nowrap }}>
                  {r.pr_number == null ? (
                    UNKNOWN
                  ) : prUrl ? (
                    <a href={prUrl} target="_blank" rel="noopener noreferrer" style={s.link}>
                      #{r.pr_number}
                    </a>
                  ) : (
                    `#${r.pr_number}`
                  )}
                </td>
                <td style={{ ...s.td, ...s.strong }}>{r.agent_name}</td>
                <td style={{ ...s.td, ...s.nowrap }}>
                  <Badge color={RESULT_COLOR[result].color} bg={RESULT_COLOR[result].bg} dot>
                    {t(`result.${result}`)}
                  </Badge>
                </td>
                <td style={s.td}>
                  {r.findings_count == null ? (
                    UNKNOWN
                  ) : (
                    <>
                      <span style={s.strong}>{r.findings_count}</span>
                      {r.findings_count > 0 && hasBreakdown(r) && (
                        <span style={s.breakdown}>
                          {t("table.breakdown", { critical: r.critical ?? 0, warning: r.warning ?? 0, suggestion: r.suggestion ?? 0 })}
                        </span>
                      )}
                    </>
                  )}
                </td>
                <td className="mono tnum" style={{ ...s.td, ...s.nowrap }}>
                  {formatCostUsd(r.cost_usd)}
                </td>
                <td className="mono tnum" style={{ ...s.td, ...s.nowrap, ...s.muted }}>
                  {formatDuration(r.duration_ms)}
                </td>
                <td style={{ ...s.td, ...s.nowrap }}>
                  {jobUrl ? (
                    <a
                      href={jobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={s.link}
                      aria-label={t("table.jobLabel", { repo: r.repo })}
                    >
                      {t("view")}
                    </a>
                  ) : (
                    UNKNOWN
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
