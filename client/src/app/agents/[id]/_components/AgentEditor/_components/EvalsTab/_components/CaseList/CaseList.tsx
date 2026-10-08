"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { AgentEvalCase } from "@devdigest/shared";
import { ConfirmModal } from "@/components/confirm-modal";
import { apiErrorMessage } from "@/lib/api";
import { useDeleteEvalCase } from "@/lib/hooks/eval";
import { notify } from "@/lib/toast";
import { CaseViewModal } from "../CaseViewModal";
import { passingCount } from "../../helpers";
import { s } from "./styles";

/** The agent's cases with their last result; open one read-only, delete one after a confirm. */
export function CaseList({ agentId, cases }: { agentId: string; cases: AgentEvalCase[] }) {
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
      </div>

      {cases.length === 0 ? (
        <div style={s.empty}>{t("empty")}</div>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>{t("columns.name")}</th>
              <th style={s.th}>{t("columns.type")}</th>
              <th style={s.th}>{t("columns.location")}</th>
              <th style={s.th}>{t("columns.source")}</th>
              <th style={s.th}>{t("columns.last")}</th>
              <th style={s.th} />
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id}>
                <td style={s.td}>{c.name}</td>
                <td style={s.td} className="mono">{c.expectation.type}</td>
                <td style={s.td} className="mono">
                  {c.expectation.file}:{c.expectation.start_line}-{c.expectation.end_line}
                </td>
                <td style={s.td} className="mono">
                  {c.meta.repo} #{c.meta.pr_number}
                </td>
                <td style={s.td}>{t(`lastResult.${c.last_result}`)}</td>
                <td style={s.td}>
                  <div style={s.actions}>
                    <Button size="sm" kind="ghost" onClick={() => setViewId(c.id)} aria-label={`${t("view")} ${c.name}`}>
                      {t("view")}
                    </Button>
                    <Button size="sm" kind="danger" onClick={() => setDeleting(c)} aria-label={`${t("delete")} ${c.name}`}>
                      {t("delete")}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
