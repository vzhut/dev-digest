/* RunRow — one agent run in the PR timeline: outcome badge, score, agent/model,
   error or finding counts, time + cost, trace and delete actions. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, CircularScore } from "@devdigest/ui";
import type { RunSummary } from "@devdigest/shared";
import { RunCostBadge } from "@/components/run-cost-badge";
import { FindingsPopover } from "@/components/findings-popover";
import { outcomeOf } from "../../helpers";
import { s } from "../../styles";

export function RunRow({
  run: r,
  onOpenTrace,
  onGoToReview,
  onDelete,
}: {
  run: RunSummary;
  onOpenTrace: (runId: string) => void;
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}) {
  const t = useTranslations("prReview");
  const o = outcomeOf(r);
  const settled = r.status === "done";
  return (
    <div style={s.row}>
      <Badge color={o.color} bg={o.bg} icon={o.icon}>
        {t(`runStatus.${o.key}`)}
      </Badge>
      {settled && r.score != null && <CircularScore score={r.score} size={30} stroke={3} />}
      <div style={s.runMain}>
        <div style={s.runTitle}>
          <button
            type="button"
            onClick={() => onGoToReview?.(r.run_id)}
            title={t("timeline.goToReview")}
            style={s.agentButton(!!onGoToReview)}
          >
            {r.agent_name ?? t("timeline.agentFallback")}
          </button>{" "}
          <span className="mono" style={s.model}>
            {r.provider}/{r.model}
          </span>
        </div>
        {r.status === "failed" && r.error && (
          <div style={s.error} title={r.error}>
            {r.error}
          </div>
        )}
        {settled && (
          <div style={s.counts}>
            {/* Severity icons + hover preview when the run's review has
                findings; otherwise the plain count ("0 finding(s)", or a
                run whose findings weren't loaded). */}
            {r.findings && r.findings.length > 0 ? (
              <FindingsPopover findings={r.findings} />
            ) : (
              t("runStatus.findings", { count: r.findings_count ?? 0 })
            )}
            {(r.blockers ?? 0) > 0 && (
              <span style={s.blockers}>{t("runStatus.blockers", { count: r.blockers ?? 0 })}</span>
            )}
          </div>
        )}
      </div>
      <div style={s.runMeta}>
        {r.ran_at && <span>{new Date(r.ran_at).toLocaleTimeString()}</span>}
        {/* Only settled runs have final usage; a running one would show a
            half-counted figure that keeps changing. */}
        {settled && (
          <RunCostBadge variant="detailed" cost={r.cost_usd} tokensIn={r.tokens_in} tokensOut={r.tokens_out} />
        )}
      </div>
      <button
        type="button"
        title={t("timeline.openTrace")}
        aria-label={t("timeline.openTrace")}
        onClick={() => onOpenTrace(r.run_id)}
        style={s.iconBtn}
      >
        <Icon.FileText size={13} />
      </button>
      {onDelete && r.status !== "running" && (
        <span
          role="button"
          aria-label={t("timeline.deleteRun")}
          title={t("timeline.deleteRun")}
          onClick={() => onDelete(r.run_id)}
          style={s.deleteBtn}
        >
          <Icon.Trash size={13} />
        </span>
      )}
    </div>
  );
}
