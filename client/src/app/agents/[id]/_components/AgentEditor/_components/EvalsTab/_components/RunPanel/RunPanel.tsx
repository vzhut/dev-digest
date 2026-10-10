"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { EvalSuiteRun } from "@devdigest/shared";
import { apiErrorMessage } from "@/lib/api";
import { useStartEvalRun } from "@/lib/hooks/eval";
import { notify } from "@/lib/toast";
import { s } from "./styles";

/** Run eval: disabled with an explanation when there is nothing to run, and while a run is going. */
export function RunPanel({
  agentId,
  casesTotal,
  runs,
}: {
  agentId: string;
  casesTotal: number;
  runs: EvalSuiteRun[];
}) {
  const t = useTranslations("eval.tab");
  const start = useStartEvalRun(agentId);
  const running = runs.find((r) => r.status === "running");
  const noCases = casesTotal === 0;

  return (
    <div style={s.wrap}>
      <Button
        kind="secondary"
        icon="Play"
        disabled={noCases || !!running}
        loading={start.isPending}
        onClick={() => start.mutate(undefined, { onError: (e) => notify.error(apiErrorMessage(e, t("startFailed"))) })}
      >
        {t("runEval")}
      </Button>
      {running && (
        <span role="status" style={s.note}>
          {t("progress", { done: running.cases_done, total: running.traces_total })}
        </span>
      )}
      {noCases && <span style={s.note}>{t("noCasesToRun")}</span>}
    </div>
  );
}
