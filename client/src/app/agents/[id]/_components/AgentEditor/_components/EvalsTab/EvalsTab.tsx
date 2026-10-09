/* EvalsTab — an agent's eval cases, the Run eval action with live progress, and its run history.
   Read-only cases (frozen from findings); runs are paid, so the button is the only trigger. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { EvalRunDetail } from "./_components/EvalRunDetail";
import { EvalMetricTiles } from "@/components/eval-metric-tiles";
import { EvalRunHistory } from "@/components/eval-run-history";
import { useAgentEvalCases, useAgentEvalRuns, useEvalRun } from "@/lib/hooks/eval";
import { CaseList } from "./_components/CaseList";
import { RunPanel } from "./_components/RunPanel";
import { s } from "./styles";

export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval.tab");
  const cases = useAgentEvalCases(agent.id);
  const runs = useAgentEvalRuns(agent.id);
  const latestFinished = runs.data?.find((r) => r.status !== "running");
  const detail = useEvalRun(latestFinished?.id);
  const completed = (runs.data ?? []).filter((r) => r.status === "completed"); // newest first
  const latest = completed[0];
  const previous = completed[1];

  if (cases.isError) {
    return (
      <div style={s.wrap}>
        <ErrorState title={t("loadError")} onRetry={() => void cases.refetch()} />
      </div>
    );
  }
  if (!cases.data) {
    return (
      <div style={s.wrap} aria-label={t("loading")}>
        <Skeleton height={120} />
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div>
        <h2 style={s.h2}>{t("title")}</h2>
        <p style={s.hint}>{t("subtitle")}</p>
      </div>

      {latest && (
        <section aria-label={t("metricsHeading")}>
          <SectionLabel
            icon="Gauge"
            right={
              <Link href={`/eval/agents/${agent.id}`} style={s.link}>
                {t("viewDashboard")}
              </Link>
            }
          >
            {t("metricsHeading")}
          </SectionLabel>
          <EvalMetricTiles latest={latest} previous={previous ?? null} />
        </section>
      )}

      <section aria-label={t("casesHeading")}>
        <CaseList
          agentId={agent.id}
          cases={cases.data}
          actions={<RunPanel agentId={agent.id} casesTotal={cases.data.length} runs={runs.data ?? []} />}
        />
      </section>

      <section>
        <div style={s.sectionHead}>
          <h3 style={s.h3}>{t("historyHeading")}</h3>
        </div>
        <EvalRunHistory runs={runs.data ?? []} />
      </section>

      {detail.data && (
        <section>
          <h3 style={{ ...s.h3, marginBottom: 8 }}>{t("detailHeading")}</h3>
          <EvalRunDetail run={detail.data} />
        </section>
      )}
    </div>
  );
}
