/* MultiAgentResults — one multi-agent run: header, Columns / Tabs mode, the "where agents
   disagree" section and one trace drawer. The run comes from the TanStack cache
   (GET /multi-agent-runs/:id); each running child's SSE stream settling refetches it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import type { FindingActionKind } from "@devdigest/shared";
import { RunTraceDrawer } from "@/components/run-trace-drawer";
import { apiErrorMessage } from "@/lib/api";
import { useFindingAction, useMultiAgentRun } from "@/lib/hooks/reviews";
import type { Mode } from "../../constants";
import { isLive } from "./helpers";
import { useNow } from "./useNow";
import { ColumnsView } from "./_components/ColumnsView";
import { ConflictsSection } from "./_components/ConflictsSection";
import { RunHeader } from "./_components/RunHeader";
import { TabsView } from "./_components/TabsView";
import { s } from "./styles";

export function MultiAgentResults({ runId, mode }: { runId: string; mode: Mode }) {
  const t = useTranslations("multiAgent.results");
  const { data: run, isLoading, isError, error, refetch } = useMultiAgentRun(runId);
  const findingAction = useFindingAction();
  const [tab, setTab] = React.useState<string | null>(null);
  const [onlyConflicts, setOnlyConflicts] = React.useState(false);
  const [drawerRunId, setDrawerRunId] = React.useState<string | null>(null);
  const now = useNow(run?.columns.some((c) => isLive(c.status)) ?? false);

  if (isLoading) {
    return (
      <div style={s.loading}>
        <Skeleton height={220} />
      </div>
    );
  }
  if (isError || !run) {
    return (
      <div style={s.loading}>
        <ErrorState title={t("loadError")} body={apiErrorMessage(error, t("loadError"))} onRetry={() => refetch()} />
      </div>
    );
  }

  const settled = () => void refetch();
  const drawerColumn = run.columns.find((c) => c.run_id === drawerRunId);
  const act = (findingId: string, action: FindingActionKind) =>
    findingAction.mutate({ findingId, action, prId: run.pr_id, multiAgentRunId: run.id });
  const pendingFindingId = findingAction.isPending ? (findingAction.variables?.findingId ?? null) : null;

  return (
    <div style={s.page}>
      <RunHeader run={run} />
      {mode === "columns" ? (
        <ColumnsView
          columns={run.columns}
          ranAt={run.ran_at}
          now={now}
          onSettled={settled}
          onViewTrace={setDrawerRunId}
        />
      ) : (
        <TabsView
          columns={run.columns}
          tab={tab}
          onTabChange={setTab}
          prId={run.pr_id}
          multiAgentRunId={run.id}
          ranAt={run.ran_at}
          now={now}
          pendingFindingId={pendingFindingId}
          onSettled={settled}
          onViewTrace={setDrawerRunId}
          onFindingAction={act}
        />
      )}
      <div style={s.conflicts}>
        <ConflictsSection
          conflicts={run.conflicts}
          columns={run.columns}
          onlyConflicts={onlyConflicts}
          onToggleOnly={setOnlyConflicts}
        />
      </div>
      {drawerColumn && (
        <RunTraceDrawer
          key={drawerColumn.run_id}
          runId={drawerColumn.run_id}
          agentName={drawerColumn.agent_name}
          prNumber={run.pr_number}
          findings={drawerColumn.findings}
          running={isLive(drawerColumn.status)}
          onClose={() => setDrawerRunId(null)}
        />
      )}
    </div>
  );
}
