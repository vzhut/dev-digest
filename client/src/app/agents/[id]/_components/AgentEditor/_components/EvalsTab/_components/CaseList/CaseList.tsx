"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, IconBtn } from "@devdigest/ui";
import type { AgentEvalCase } from "@devdigest/shared";
import { ConfirmModal } from "@/components/confirm-modal";
import { apiErrorMessage } from "@/lib/api";
import { useDeleteEvalCase } from "@/lib/hooks/eval";
import { notify } from "@/lib/toast";
import { CaseViewModal } from "../CaseViewModal";
import { passingCount } from "../../helpers";
import { s } from "./styles";

/** The agent's cases with their last result; open one read-only, delete one after a confirm. */
/** "CRITICAL · security" from the finding the case was frozen from; the expectation type when it carries no label. */
function chipText(c: AgentEvalCase): string {
  const label = c.expectation.label;
  return label ? `${label.severity} · ${label.category}` : c.expectation.type;
}

function StatusIcon({ result }: { result: AgentEvalCase["last_result"] }) {
  if (result === "passed") return <Icon.CheckCircle size={20} style={{ color: "var(--ok)" }} />;
  if (result === "failed") return <Icon.XCircle size={20} style={{ color: "var(--crit)" }} />;
  if (result === "error") return <Icon.AlertTriangle size={20} style={{ color: "var(--warn)" }} />;
  return <span style={s.dot} />;
}

export function CaseList({ agentId, cases, actions }: { agentId: string; cases: AgentEvalCase[]; actions?: React.ReactNode }) {
  const t = useTranslations("eval.tab");
  const [viewId, setViewId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<AgentEvalCase | null>(null);
  const del = useDeleteEvalCase(agentId);
  const { passed, total } = passingCount(cases);

  return (
    <>
      <div style={s.head}>
        <h3 style={s.h3}>{t("casesHeading")}</h3>
        <span style={s.count}>{t("passing", { passed, total })}</span>
        {actions && <div style={s.actions}>{actions}</div>}
      </div>

      {cases.length === 0 ? (
        <div style={s.empty}>{t("empty")}</div>
      ) : (
        <ul style={s.list}>
          {cases.map((c) => (
            <li key={c.id} style={s.row}>
              <span style={s.statusIcon}>
                <StatusIcon result={c.last_result} />
              </span>
              <div style={s.main}>
                <div className="mono" style={s.name}>
                  {c.name}
                </div>
                <div style={s.detail}>
                  {t(`lastResult.${c.last_result}`)} · {c.expectation.type} · {c.expectation.file}:{c.expectation.start_line}-
                  {c.expectation.end_line} · {c.meta.repo} #{c.meta.pr_number}
                </div>
              </div>
              <span style={s.chip}>{chipText(c)}</span>
              <div style={s.buttons}>
                <IconBtn icon="Eye" label={`${t("view")} ${c.name}`} onClick={() => setViewId(c.id)} />
                <IconBtn icon="Trash" danger label={`${t("delete")} ${c.name}`} onClick={() => setDeleting(c)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {viewId && <CaseViewModal caseId={viewId} onClose={() => setViewId(null)} />}
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
