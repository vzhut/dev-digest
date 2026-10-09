"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, IconBtn } from "@devdigest/ui";
import type { Agent, AgentEvalCase, EvalSuiteRun } from "@devdigest/shared";
import { ConfirmModal } from "@/components/confirm-modal";
import { apiErrorMessage } from "@/lib/api";
import { formatDuration, formatRunCost } from "@/lib/eval-format";
import { useDeleteEvalCase, useStartEvalRun } from "@/lib/hooks/eval";
import { notify } from "@/lib/toast";
import { CaseEditorModal } from "../CaseEditorModal";
import { RunPanel } from "../RunPanel";
import { chipText, expectedFindings, passingCount, sourceLabel } from "../../helpers";
import { RowButton } from "./RowButton";
import { s } from "./styles";

function StatusIcon({ result }: { result: AgentEvalCase["last_result"] }) {
  if (result === "passed") return <Icon.CheckCircle size={20} style={{ color: "var(--ok)" }} />;
  if (result === "failed") return <Icon.XCircle size={20} style={{ color: "var(--crit)" }} />;
  if (result === "error") return <Icon.AlertTriangle size={20} style={{ color: "var(--warn)" }} />;
  return <span style={s.dot} />;
}

/**
 * The agent's cases: run all / new case in the header, and per row run, edit and delete. While a run is
 * going every run control is disabled (the server answers 409 to a second one anyway).
 */
export function CaseList({ agent, cases, runs }: { agent: Agent; cases: AgentEvalCase[]; runs: EvalSuiteRun[] }) {
  const t = useTranslations("eval.tab");
  // `null` = closed, "new" = empty editor, otherwise the id of the case being edited
  const [editing, setEditing] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<AgentEvalCase | null>(null);
  const del = useDeleteEvalCase(agent.id);
  const start = useStartEvalRun(agent.id);
  const running = runs.some((r) => r.status === "running");
  const { passed, total } = passingCount(cases);

  const runCase = (c: AgentEvalCase) =>
    start.mutate([c.id], { onError: (e) => notify.error(apiErrorMessage(e, t("startFailed"))) });

  return (
    <>
      <div style={s.head}>
        <h3 style={s.h3}>{t("casesHeading")}</h3>
        <span style={s.count}>{t("passing", { passed, total })}</span>
        <div style={s.actions}>
          <RunPanel agentId={agent.id} casesTotal={cases.length} runs={runs} />
          <Button kind="primary" icon="Plus" onClick={() => setEditing("new")}>
            {t("newCase")}
          </Button>
        </div>
      </div>

      {cases.length === 0 ? (
        <div style={s.empty}>{t("empty")}</div>
      ) : (
        <ul style={s.list}>
          {cases.map((c) => {
            const last = c.last_run;
            const source = sourceLabel(c.meta);
            return (
              <li key={c.id} style={s.row}>
                <span style={s.statusIcon}>
                  <StatusIcon result={c.last_result} />
                </span>
                <div style={s.main}>
                  <div className="mono" style={s.name}>
                    {c.name}
                  </div>
                  <div style={s.detail}>
                    {last
                      ? `${t("expectedSummary", { expected: expectedFindings(c), got: last.findings_matched })} · ${formatDuration(last.duration_ms)} · ${formatRunCost(last.cost_usd, false)}`
                      : t("neverRun")}
                    {` · ${c.expectation.file}:${c.expectation.start_line}-${c.expectation.end_line} · ${source ?? t("sourceManual")}`}
                  </div>
                </div>
                <span style={s.chip}>{chipText(c)}</span>
                <div style={s.buttons}>
                  <RowButton icon="Play" label={`${t("rowRun")} ${c.name}`} disabled={running || start.isPending} onClick={() => runCase(c)} />
                  <IconBtn icon="Edit" label={`${t("rowEdit")} ${c.name}`} onClick={() => setEditing(c.id)} />
                  <IconBtn icon="Trash" danger label={`${t("delete")} ${c.name}`} onClick={() => setDeleting(c)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <CaseEditorModal agent={agent} caseId={editing === "new" ? null : editing} running={running} onClose={() => setEditing(null)} />
      )}
      {deleting && (
        <ConfirmModal
          title={t("deleteTitle")}
          body={t("deleteBody", { name: deleting.name })}
          confirmLabel={t("deleteConfirm")}
          pending={del.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            del.mutate(deleting.id, {
              onSuccess: () => setDeleting(null),
              onError: (e) => notify.error(apiErrorMessage(e, t("deleteTitle"))),
            })
          }
        />
      )}
    </>
  );
}
