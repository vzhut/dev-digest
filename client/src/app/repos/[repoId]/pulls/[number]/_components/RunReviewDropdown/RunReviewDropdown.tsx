/* RunReviewDropdown — the PR page's multi-agent picker. Enabled agents are all checked by
   default; "Run multi-agent review (N)" starts ONE concurrent review with the checked agents
   and opens its results page. */
"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { AgentIcon } from "@/components/agent-icon";
import { useAgents } from "@/lib/hooks/agents";
import { useAgentEstimates, useLatestPrMultiAgentRun, useStartMultiAgentReview } from "@/lib/hooks/reviews";
import { enabledAgents, estimatesFor, toggleId } from "@/lib/agent-selection";
import { useMultiAgentFormat } from "@/lib/hooks/multi-agent-format";
import { PANEL_WIDTH } from "./constants";
import { checkedIds } from "./helpers";
import { useDismiss } from "./useDismiss";
import { s } from "./styles";

export function RunReviewDropdown({
  prId,
  size = "sm",
  kind = "primary",
  warnMerged = false,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
  size?: "sm" | "md" | "lg";
  kind?: "primary" | "secondary";
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired the moment a run is kicked off (before it completes). */
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
  /** Fired when the run request settles (success or error). */
  onRunSettled?: () => void;
}) {
  const t = useTranslations("prReview");
  const fmt = useMultiAgentFormat();
  const router = useRouter();
  const { repoId } = useParams<{ repoId: string }>();
  const { data: agents } = useAgents();
  const { data: estimates } = useAgentEstimates();
  const start = useStartMultiAgentReview();
  const { data: lastRun } = useLatestPrMultiAgentRun(prId);
  const [open, setOpen] = React.useState(false);
  const [unchecked, setUnchecked] = React.useState<ReadonlySet<string>>(new Set());
  const rootRef = React.useRef<HTMLDivElement>(null);

  const close = React.useCallback(() => setOpen(false), []);
  useDismiss(open, rootRef, close);

  const enabled = enabledAgents(agents);
  const ids = checkedIds(enabled, unchecked);
  const byAgent = new Map((estimates ?? []).map((e) => [e.agent_id, e]));

  const run = () => {
    onRunStart?.();
    start.mutate(
      { prId, agentIds: ids },
      {
        onSuccess: (res) => {
          onRunsStarted?.(res.runs.map((r) => r.run_id));
          setOpen(false);
          if (res.multi_agent_run_id) {
            router.push(`/repos/${repoId}/multi-agent?run=${res.multi_agent_run_id}`);
          }
        },
        onSettled: () => onRunSettled?.(),
      },
    );
  };

  return (
    <div style={s.group}>
      {lastRun?.id && (
        <Button
          kind="secondary"
          size={size}
          icon="Users"
          onClick={() => router.push(`/repos/${repoId}/multi-agent?run=${lastRun.id}`)}
        >
          {t("runReview.lastRun")}
        </Button>
      )}
    <div ref={rootRef} style={s.root}>
      <span
        title={warnMerged ? t("runReview.mergedTooltip") : undefined}
        style={warnMerged ? { opacity: 0.6 } : undefined}
      >
        <Button
          kind={kind}
          size={size}
          iconRight="ChevronDown"
          icon="Sparkles"
          loading={start.isPending}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {start.isPending ? t("runReview.running") : t("runReview.runReview")}
        </Button>
      </span>
      {open && (
        <div role="dialog" aria-label={t("runReview.pickerLabel")} style={s.panel(PANEL_WIDTH)}>
          {warnMerged && <div style={s.warning}>{t("runReview.mergedWarning")}</div>}
          {enabled.length === 0 ? (
            <div style={s.empty}>
              <span>{t("runReview.noEnabledAgents")}</span>
              <Link href="/agents">{t("runReview.goToAgents")}</Link>
            </div>
          ) : (
            <>
              <div style={s.headerRow}>
                <span style={s.heading}>{t("runReview.agentsHeading")}</span>
                <Button
                  kind="ghost"
                  size="sm"
                  disabled={ids.length === 0}
                  onClick={() => setUnchecked(new Set(enabled.map((a) => a.id)))}
                >
                  {t("runReview.clear")}
                </Button>
              </div>
              <div style={s.list}>
                {enabled.map((a) => (
                  <label key={a.id} style={s.row}>
                    <input
                      type="checkbox"
                      checked={!unchecked.has(a.id)}
                      onChange={() => setUnchecked((u) => toggleId(u, a.id))}
                    />
                    <AgentIcon agent={a} size={14} />
                    <span style={s.rowName}>{a.name}</span>
                    <span style={s.rowEstimate}>{fmt.estimate(byAgent.get(a.id))}</span>
                  </label>
                ))}
              </div>
              <div style={s.footer}>
                <div style={s.total}>{fmt.total(estimatesFor(ids, estimates))}</div>
                <Button
                  kind="primary"
                  size="sm"
                  icon="Play"
                  disabled={ids.length === 0 || start.isPending}
                  onClick={run}
                >
                  {t("runReview.runMulti", { count: ids.length })}
                </Button>
                <Link href={`/repos/${repoId}/multi-agent?configure=1`}>{t("runReview.configureAgents")}</Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
    </div>
  );
}
