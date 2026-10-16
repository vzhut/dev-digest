/* ConfigureRun — pick a pull request and the enabled agents to run on it (none checked
   by default), see the estimated total, and start one concurrent review. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, Icon, Skeleton } from "@devdigest/ui";
import { AgentIcon } from "@/components/agent-icon";
import { agentAppearance } from "@/lib/agent-appearance";
import { useAgents } from "@/lib/hooks/agents";
import { usePulls } from "@/lib/hooks/core";
import { useAgentEstimates, useStartMultiAgentReview } from "@/lib/hooks/reviews";
import { enabledAgents, estimatesFor, toggleId } from "@/lib/agent-selection";
import { useMultiAgentFormat } from "@/lib/hooks/multi-agent-format";
import { checkedIds } from "./helpers";
import { StepBadge } from "./StepBadge";
import { s } from "./styles";

export function ConfigureRun({ repoId }: { repoId: string }) {
  const t = useTranslations("multiAgent.configure");
  const fmt = useMultiAgentFormat();
  const router = useRouter();
  const { data: pulls } = usePulls(repoId);
  const { data: agents, isLoading } = useAgents();
  const { data: estimates } = useAgentEstimates();
  const start = useStartMultiAgentReview();
  const [prId, setPrId] = React.useState("");
  const [checked, setChecked] = React.useState<ReadonlySet<string>>(new Set());

  const enabled = enabledAgents(agents);
  const ids = checkedIds(enabled, checked);
  const byAgent = new Map((estimates ?? []).map((e) => [e.agent_id, e]));
  const canRun = !!prId && ids.length > 0 && !start.isPending;

  const run = () =>
    start.mutate(
      { prId, agentIds: ids },
      {
        onSuccess: (res) => {
          if (res.multi_agent_run_id) router.push(`/repos/${repoId}/multi-agent?run=${res.multi_agent_run_id}`);
        },
      },
    );

  if (isLoading) {
    return (
      <div style={s.form}>
        <Skeleton height={120} />
      </div>
    );
  }

  if (enabled.length === 0) {
    return (
      <EmptyState
        icon="Cpu"
        title={t("noAgentsTitle")}
        body={t("noAgentsBody")}
        cta={t("goToAgents")}
        onCta={() => router.push("/agents")}
      />
    );
  }

  return (
    <div style={s.form}>
      <div style={s.step}>
        <div style={s.stepHead}>
          <StepBadge n={1} active />
          <label htmlFor="multi-agent-pr" style={s.stepTitle}>
            {t("pullRequest")}
          </label>
        </div>
        <select id="multi-agent-pr" style={s.select} value={prId} onChange={(e) => setPrId(e.target.value)}>
          <option value="">{t("pickPr")}</option>
          {(pulls ?? [])
            .filter((p) => p.id)
            .map((p) => (
              <option key={p.id} value={p.id ?? ""}>
                #{p.number} {p.title}
              </option>
            ))}
        </select>
      </div>

      <div style={s.step}>
        <div style={s.stepHead}>
          <StepBadge n={2} active={!!prId} />
          <span style={prId ? s.stepTitle : s.stepTitleMuted}>{t("agentsToRun")}</span>
          {prId && (
            <button type="button" style={s.selectAll} onClick={() => setChecked(new Set(enabled.map((a) => a.id)))}>
              {t("selectAll")}
            </button>
          )}
        </div>
        {!prId ? (
          <div style={s.placeholder}>
            <Icon.GitPullRequest size={22} style={s.placeholderIcon} />
            <div style={s.placeholderTitle}>{t("pickPrFirst")}</div>
            <div style={s.placeholderBody}>{t("pickPrBody")}</div>
          </div>
        ) : (
          <div style={s.list}>
            {enabled.map((a) => {
              const on = checked.has(a.id);
              const color = agentAppearance(a).color;
              return (
                <label key={a.id} style={s.card(on, color)}>
                  <input type="checkbox" checked={on} onChange={() => setChecked((c) => toggleId(c, a.id))} />
                  <AgentIcon agent={a} size={17} tile={34} />
                  <span style={s.cardBody}>
                    <span style={s.cardName}>{a.name}</span>
                    <span style={s.cardDesc}>{a.description}</span>
                  </span>
                  <span className="mono tnum" style={s.cardEstimate}>
                    {fmt.estimateCompact(byAgent.get(a.id))}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div style={s.footer}>
        <Button kind="primary" icon="Play" disabled={!canRun} loading={start.isPending} onClick={run}>
          {t("run", { count: ids.length })}
        </Button>
        {ids.length > 0 && (
          <span className="mono" style={s.total}>
            {fmt.total(estimatesFor(ids, estimates))}
          </span>
        )}
      </div>
    </div>
  );
}
