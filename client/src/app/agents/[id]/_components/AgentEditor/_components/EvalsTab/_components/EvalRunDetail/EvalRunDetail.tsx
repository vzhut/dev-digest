/* EvalRunDetail — one finished (or running) eval run: metrics, cost, duration and, per case, the
   expected vs produced findings labelled matched / missed / noise / unlabeled / dropped. Every
   string that came from a PR, a finding or a provider is rendered as plain text. */
"use client";

import { useTranslations } from "next-intl";
import type { EvalSuiteRunDetail } from "@devdigest/shared";
import { formatDuration, formatMetric, formatRunCost, progressLabel } from "@/lib/eval-format";
import { expectationLabel, producedRows, sharedErrorReason } from "./helpers";
import { s } from "./styles";

export function EvalRunDetail({ run }: { run: EvalSuiteRunDetail }) {
  const t = useTranslations("eval.runDetail");
  const sharedError = sharedErrorReason(run.results);
  const metrics: [string, string][] = [
    [t("metrics.recall"), formatMetric(run.recall)],
    [t("metrics.precision"), formatMetric(run.precision)],
    [t("metrics.citation"), formatMetric(run.citation_accuracy)],
    [t("metrics.passed"), progressLabel(run.traces_passed, run.traces_total)],
    [t("metrics.cost"), formatRunCost(run.cost_usd, run.cost_partial)],
    [t("metrics.duration"), formatDuration(run.duration_ms)],
  ];

  return (
    <div style={s.root}>
      <div style={s.tiles}>
        {metrics.map(([label, value]) => (
          <div key={label} style={s.tile}>
            <div style={s.tileLabel}>{label}</div>
            <div style={s.tileValue} title={label === t("metrics.cost") && run.cost_partial ? t("partialCostHint") : undefined}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {run.status === "errored" && run.error_reason && (
        <div role="alert" style={s.notice}>
          {t("runError", { reason: run.error_reason })}
        </div>
      )}
      {run.cases_errored > 0 && sharedError && (
        <div role="alert" style={s.notice}>
          {t("casesErrored", { count: run.cases_errored, reason: sharedError })}
        </div>
      )}

      <h3 style={s.heading}>{t("casesHeading")}</h3>
      {run.results.map((result) => (
        <section key={result.case_id} style={s.caseCard} aria-label={result.case_name ?? result.case_id}>
          <div style={s.caseHead}>
            <span style={s.caseName}>{result.case_name ?? result.case_id}</span>
            <span style={s.label}>{t(`caseStatus.${result.status}`)}</span>
          </div>
          {result.status === "error" && !sharedError && result.error && <div style={s.muted}>{result.error}</div>}

          {result.outcomes.map((o, i) => {
            const label = expectationLabel(o.expectation.type, o.matched_by);
            return (
              <div key={i} style={s.muted}>
                {t("expected")}: {t(`expectationType.${o.expectation.type}`)} {o.expectation.file}:{o.expectation.start_line}-
                {o.expectation.end_line}
                {label && <span style={s.label}>{t(`outcome.${label}`)}</span>}
              </div>
            );
          })}

          {result.status !== "error" &&
            (result.produced.length === 0 ? (
              <div style={s.muted}>{t("noFindings")}</div>
            ) : (
              <ul style={s.list} aria-label={t("produced")}>
                {producedRows(result).map(({ finding, label }, i) => (
                  <li key={i}>
                    {finding.title} — {finding.file}:{finding.start_line}-{finding.end_line}
                    <span style={s.label}>{t(`outcome.${label}`)}</span>
                  </li>
                ))}
              </ul>
            ))}

          {result.dropped.length > 0 && (
            <ul style={s.list} aria-label={t("droppedHeading")}>
              {result.dropped.map((d, i) => (
                <li key={i}>
                  {d.finding.title} — {d.finding.file}:{d.finding.start_line}-{d.finding.end_line}
                  <span style={s.label}>{t("outcome.dropped")}</span> <span style={s.muted}>{d.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
