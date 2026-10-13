/* /eval/agents/:agentId — one agent's latest metrics (with delta to the previous run), trend,
   regression callout, selectable run history with Compare, and Run eval (the paid action). */
"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { EvalRunHistory } from "@/components/eval-run-history";
import { apiErrorMessage } from "@/lib/api";
import { useAgentEvalDashboard, useEvalDashboard, useStartEvalRun } from "@/lib/hooks/eval";
import { notify } from "@/lib/toast";
import { CompareModal } from "./_components/CompareModal";
import { EvalMetricTiles } from "@/components/eval-metric-tiles";
import { RegressionBanner } from "./_components/RegressionBanner";
import { TrendChart } from "./_components/TrendChart";
import { toggleSelected } from "./helpers";
import { s } from "./styles";

export function EvalAgentDetailView() {
  const t = useTranslations("eval.agentView");
  const board = useTranslations("eval.board");
  const { agentId } = useParams<{ agentId: string }>();
  const router = useRouter();
  const dash = useAgentEvalDashboard(agentId);
  const all = useEvalDashboard();
  const start = useStartEvalRun(agentId);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [comparing, setComparing] = React.useState<[string, string] | null>(null);

  const d = dash.data;
  const crumb = [
    { label: t("crumbLab") },
    { label: board("title"), href: "/eval" },
    { label: d?.agent_name ?? "…" },
  ];

  if (dash.isError) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <ErrorState title={t("loadError")} body={apiErrorMessage(dash.error, "")} onRetry={() => void dash.refetch()} />
        </div>
      </AppShell>
    );
  }
  if (!d) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page} aria-label={t("loading")}>
          <Skeleton height={160} />
        </div>
      </AppShell>
    );
  }

  const running = d.runs.find((r) => r.status === "running");
  const canRun = d.cases_total > 0 && !running;

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.topRow}>
          <Link href="/eval" style={s.back}>
            {t("backToAll")}
          </Link>
        </div>

        <div style={s.header}>
          <div style={s.titleBox}>
            <div style={s.titleRow}>
              <h1 style={s.h1}>{d.agent_name}</h1>
              <span className="mono" style={s.modelChip}>
                {d.model}
              </span>
            </div>
            <p style={s.meta}>{t("subtitle", { runs: d.runs.length, cases: d.cases_total })}</p>
          </div>
          <div style={s.actions}>
            {all.data && all.data.cards.length > 1 && (
            <label style={s.switcher}>
              <Icon.Cpu size={14} />
              <span style={s.srOnly}>{t("switcher")}</span>
              <select
                style={s.select}
                value={agentId}
                onChange={(e) => router.push(`/eval/agents/${e.target.value}`)}
              >
                  {all.data.cards.map((c) => (
                  <option key={c.agent_id} value={c.agent_id}>
                    {c.agent_name}
                  </option>
                ))}
              </select>
            </label>
            )}
            {running && (
              <span role="status" style={s.progress}>
                {t("progress", { done: running.cases_done, total: running.traces_total })}
              </span>
            )}
            <Button
              kind="primary"
              icon="Play"
              disabled={!canRun}
              loading={start.isPending}
              onClick={() => start.mutate(undefined, { onError: (e) => notify.error(apiErrorMessage(e, t("startFailed"))) })}
            >
              {t("runEval")}
            </Button>
          </div>
        </div>

        {d.cases_total === 0 ? (
          <EmptyState icon="FlaskConical" title={t("noCasesTitle")} body={t("noCasesBody")} />
        ) : !d.latest ? (
          <EmptyState icon="FlaskConical" title={t("noRunsTitle")} body={t("noRunsBody", { count: d.cases_total })} />
        ) : (
          <>
            <RegressionBanner regression={d.regression} />
            <EvalMetricTiles latest={d.latest} previous={d.previous} trend={d.trend} />
            <TrendChart trend={d.trend} />
          </>
        )}

        {d.runs.length > 0 && (
          <section>
            <div style={s.sectionHead}>
              <div style={s.actions}>
                <SectionLabel icon="History">{t("recentRuns")}</SectionLabel>
                <span style={s.hint}>{selected.length === 0 ? t("compareHint") : t("selected", { count: selected.length })}</span>
              </div>
              <Button
                kind="primary"
                size="sm"
                icon="GitMerge"
                disabled={selected.length !== 2}
                onClick={() => selected.length === 2 && setComparing([selected[0]!, selected[1]!])}
              >
                {t("compare")}
              </Button>
            </div>
            <EvalRunHistory
              runs={d.runs}
              selectable
              selectedIds={selected}
              onToggle={(id) => setSelected((cur) => toggleSelected(cur, id))}
            />
          </section>
        )}

        {comparing && <CompareModal a={comparing[0]} b={comparing[1]} onClose={() => setComparing(null)} />}
      </div>
    </AppShell>
  );
}
