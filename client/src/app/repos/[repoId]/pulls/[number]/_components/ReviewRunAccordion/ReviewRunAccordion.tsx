/* ReviewRunAccordion — one collapsible review RUN (a single agent's pass over
   the PR). Header shows agent + verdict + counts + score + when it ran; the
   body holds that run's VerdictBanner summary and its own FindingsPanel. A PR
   can have many runs (different agents / re-runs over time) — each is separate
   and collapsible so older runs don't bury the latest. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge } from "@devdigest/ui";
import type { ReviewRecord, Verdict } from "@devdigest/shared";
import { FindingsPanel } from "../FindingsPanel";
import { VerdictBanner } from "../VerdictBanner";
import { RunCostBadge } from "@/components/run-cost-badge";
import { useDeleteReview } from "@/lib/hooks/reviews";
import { s } from "./styles";

const VERDICT_COLOR: Record<string, string> = {
  request_changes: "var(--crit)",
  comment: "var(--warn)",
  approve: "var(--ok)",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function ReviewRunAccordion({
  review,
  prId,
  defaultOpen = false,
  repoFullName,
  headSha,
  targetRunId = null,
  targetNonce = 0,
}: {
  review: ReviewRecord;
  prId: string;
  defaultOpen?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  /** When this matches review.run_id, the accordion opens and scrolls into view
   *  (driven from the Timeline: clicking an agent name navigates here). */
  targetRunId?: string | null;
  targetNonce?: number;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(defaultOpen);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (review.run_id && review.run_id === targetRunId) {
      setOpen(true);
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [targetRunId, targetNonce, review.run_id]);
  const del = useDeleteReview(prId);
  const findings = review.findings;
  const blockers = findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length;
  const verdictColor = review.verdict ? VERDICT_COLOR[review.verdict] ?? "var(--text-muted)" : "var(--text-muted)";

  return (
    <div
      ref={rootRef}
      id={review.run_id ? `review-run-${review.run_id}` : undefined}
      style={s.root}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((o) => !o);
        }}
        style={s.header}
      >
        <Icon.Cpu size={15} style={s.agentIcon} />
        <span style={s.agentName}>{review.agent_name ?? t("timeline.agentFallback")}</span>
        {review.verdict && (
          <Badge color={verdictColor} bg="transparent">
            {review.verdict.replace("_", " ")}
          </Badge>
        )}
        <span style={s.counts}>
          {t("findingsTab.accordionFindings", { count: findings.length })}
          {blockers > 0 ? t("findingsTab.accordionBlockers", { count: blockers }) : ""}
        </span>
        <span style={s.spacer} />
        {review.score != null && (
          <Badge mono color="var(--text-secondary)">
            {review.score}
          </Badge>
        )}
        {/* What the run behind this review cost (joined in via `run_id`). */}
        <RunCostBadge
          variant="detailed"
          cost={review.cost_usd}
          tokensIn={review.tokens_in}
          tokensOut={review.tokens_out}
        />
        <span className="mono" style={s.when}>
          {formatWhen(review.created_at)}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(t("findingsTab.confirmDeleteReview", { agent: review.agent_name ?? t("findingsTab.agentFallback") }))) {
              del.mutate(review.id);
            }
          }}
          disabled={del.isPending}
          title={t("findingsTab.deleteRun")}
          aria-label={t("findingsTab.deleteRun")}
          style={s.deleteBtn(del.isPending)}
        >
          <Icon.Trash size={14} style={del.isPending ? s.deleting : undefined} />
        </button>
        <Icon.ChevronDown
          size={16}
          style={s.chevron(open)}
        />
      </div>

      {open && (
        <div style={s.body}>
          {review.verdict && (
            <div style={s.verdict}>
              <VerdictBanner
                verdict={review.verdict as Verdict}
                summary={review.summary}
                score={review.score}
                findingsCount={findings.length}
                blockers={blockers}
                agentName={review.agent_name}
              />
            </div>
          )}
          <FindingsPanel
            findings={findings}
            prId={prId}
            repoFullName={repoFullName}
            headSha={headSha}
          />
        </div>
      )}
    </div>
  );
}
