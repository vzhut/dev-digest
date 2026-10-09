import React from "react";
import { useTranslations } from "next-intl";
import type { AgentEvalCaseDetail } from "@devdigest/shared";
import { apiErrorMessage } from "@/lib/api";
import { useCreateManualEvalCase, useStartEvalRun, useUpdateEvalCase } from "@/lib/hooks/eval";
import { notify } from "@/lib/toast";
import { toWriteBody, type CaseForm } from "./helpers";

/** Save (create or update) a case and, when asked and no run is going, start a run of just that case. */
export function useCaseSave({
  agentId,
  existing,
  form,
  running,
  onDone,
}: {
  agentId: string;
  existing: AgentEvalCaseDetail | undefined;
  form: CaseForm;
  running: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("eval.tab.editor");
  const create = useCreateManualEvalCase(agentId);
  const update = useUpdateEvalCase(agentId);
  const start = useStartEvalRun(agentId);
  const [error, setError] = React.useState<string | null>(null);
  const born = existing?.meta.source_finding_id != null;

  const save = async (thenRun: boolean) => {
    setError(null);
    try {
      const body = toWriteBody(form, born);
      const id = existing
        ? (await update.mutateAsync({ caseId: existing.id, body })).id
        : (await create.mutateAsync(body)).case.id;
      if (thenRun && !running) {
        // Wait for the run request and report a failure through the app-wide notifier: the editor closes right
        // after, and a per-call callback of an unmounted component would drop the error (the user would believe
        // a paid run had started).
        try {
          await start.mutateAsync([id]);
        } catch (e) {
          notify.error(apiErrorMessage(e, t("runFailed")));
        }
      }
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e, t("saveFailed")));
    }
  };

  return { save, error, pending: create.isPending || update.isPending, born };
}
