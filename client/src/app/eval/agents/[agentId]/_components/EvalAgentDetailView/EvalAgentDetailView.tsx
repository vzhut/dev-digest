/* /eval/agents/:agentId — one agent's latest metrics (with delta to the previous run), trend,
   regression callout, selectable run history with Compare, and Run eval (the paid action). */
"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { EvalRunHistory } from "@/components/eval-run-history";
import { apiErrorMessage } from "@/lib/api";
import { useAgentEvalDashboard, useEvalDashboard, useStartEvalRun } from "@/lib/hooks/eval";
import { notify } from "@/lib/toast";
import { CompareModal } from "./_components/CompareModal";
import { MetricTiles } from "./_components/MetricTiles";
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
          {all.data && all.data.cards.length > 1 && (
            <label style={s.hint}>
              {t("switcher")}{" "}
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
        </div>

        <div style={s.header}>
          <div style={s.titleBox}>
            <h1 style={s.h1}>{d.agent_name}</h1>
            <p style={s.meta} className="mono">
              {d.model}
            </p>
          </div>
          <div style={s.actions}>
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
            <MetricTiles latest={d.latest} previous={d.previous} />
            <section>
              <h2 style={s.h2}>{t("trendHeading")}</h2>
              <TrendChart trend={d.trend} />
            </section>
          </>
        )}

        {d.runs.length > 0 && (
          <section>
            <div style={s.sectionHead}>
              <h2 style={{ ...s.h2, margin: 0 }}>{t("historyHeading")}</h2>
              <div style={s.actions}>
                <span style={s.hint}>{t("compareHint")}</span>
                <Button
                  kind="secondary"
                  size="sm"
                  disabled={selected.length !== 2}
                  onClick={() => selected.length === 2 && setComparing([selected[0]!, selected[1]!])}
                >
                  {t("compare")}
                </Button>
              </div>
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
