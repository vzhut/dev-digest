/* /eval — Eval Dashboard: one card per agent that has eval cases (latest metrics + sparkline) and a
   table of recent runs across agents. "Run all agents" is the only paid action here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import type { RunAllEvalResponse } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { apiErrorMessage } from "@/lib/api";
import { useEvalDashboard, useRunAllEvals } from "@/lib/hooks/eval";
import { notify } from "@/lib/toast";
import { AgentCard } from "./_components/AgentCard";
import { RecentRunsTable } from "./_components/RecentRunsTable";
import { agentNames, skippedItems } from "./helpers";
import { s } from "./styles";

export function EvalDashboardView() {
  const t = useTranslations("eval.board");
  const tv = useTranslations("eval.agentView");
  const dash = useEvalDashboard();
  const runAll = useRunAllEvals();
  const [report, setReport] = React.useState<RunAllEvalResponse | null>(null);
  const nameOf = new Map((dash.data?.cards ?? []).map((c) => [c.agent_id, c.agent_name] as const));

  const onRunAll = () =>
    runAll.mutate(undefined, {
      onSuccess: setReport,
      onError: (e) => notify.error(apiErrorMessage(e, t("runAllFailed"))),
    });

  return (
    <AppShell crumb={[{ label: tv("crumbLab") }, { label: t("title") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("title")}</h1>
            <p style={s.subtitle}>{t("subtitle")}</p>
          </div>
          {dash.data && dash.data.cards.length > 0 && (
            <Button kind="primary" size="sm" icon="Play" loading={runAll.isPending} onClick={onRunAll}>
              {t("runAll")}
            </Button>
          )}
        </div>

        {report && (
          <div role="status" style={s.report}>
            {report.started.length > 0 && <span>{t("runAllStarted", { names: agentNames(report.started, nameOf) })}</span>}
            {report.skipped.length > 0 && (
              <span>
                {t("runAllSkipped", {
                  items: skippedItems(report.skipped, nameOf, (code) =>
                    t.has(`skipReason.${code}`) ? t(`skipReason.${code}`) : code,
                  ),
                })}
              </span>
            )}
          </div>
        )}

        {dash.isError ? (
          <ErrorState title={t("loadError")} onRetry={() => void dash.refetch()} />
        ) : !dash.data ? (
          <div aria-label={t("loading")}>
            <Skeleton height={140} />
          </div>
        ) : dash.data.cards.length === 0 ? (
          <EmptyState icon="FlaskConical" title={t("emptyTitle")} body={t("emptyBody")} />
        ) : (
          <>
            <section aria-label={t("agentsHeading")}>
              <SectionLabel icon="Cpu">{t("agentsHeading")}</SectionLabel>
              <div style={s.grid}>
                {dash.data.cards.map((card) => (
                  <AgentCard key={card.agent_id} card={card} />
                ))}
              </div>
            </section>
            <section>
              <SectionLabel icon="History">{t("recentHeading")}</SectionLabel>
              <RecentRunsTable runs={dash.data.recent_runs} />
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
