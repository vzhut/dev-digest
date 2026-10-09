/* CaseEditorModal — create or edit one eval case: name, the diff the agent will review, and the structured
   expectation (type, file, lines, optional title). Validity mirrors the server; Save stays disabled until the
   form is valid. "Run on save" (default OFF, remembered) and "Run case" start a paid run of just this case. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Modal, Skeleton, Toggle } from "@devdigest/ui";
import type { Agent, AgentEvalCaseDetail } from "@devdigest/shared";
import { formatDuration, formatRunCost } from "@/lib/eval-format";
import { useEvalCase } from "@/lib/hooks/eval";
import { expectedFindings } from "../../helpers";
import { ExpectationFields } from "./_components/ExpectationFields";
import { InputTabs } from "./_components/InputTabs";
import { validateCase, type CaseForm } from "./helpers";
import { useCaseSave } from "./useCaseSave";
import { useRunOnSave } from "./useRunOnSave";
import { s } from "./styles";

function initialForm(c: AgentEvalCaseDetail | undefined): CaseForm {
  return {
    name: c?.name ?? "",
    diff: c?.input_diff ?? "",
    type: c?.expectation.type ?? "must_find",
    file: c?.expectation.file ?? "",
    startLine: c ? String(c.expectation.start_line) : "",
    endLine: c ? String(c.expectation.end_line) : "",
    title: c?.expectation.label?.title ?? "",
    prTitle: c?.meta.pr_title ?? "",
    prBody: c?.meta.pr_body ?? "",
  };
}

export function CaseEditorModal({
  agent,
  caseId,
  running,
  onClose,
}: {
  agent: Agent;
  /** null = a new case. */
  caseId: string | null;
  /** A run of this agent is going: every run control is disabled (AC-47). */
  running: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("eval.tab.editor");
  const detail = useEvalCase(caseId);

  if (caseId && !detail.data) {
    return (
      <Modal width={980} title={t("loading")} onClose={onClose}>
        <div style={{ padding: 24 }}>{detail.isError ? t("loadError") : <Skeleton height={200} />}</div>
      </Modal>
    );
  }
  return <EditorForm key={caseId ?? "new"} agent={agent} existing={detail.data} running={running} onClose={onClose} />;
}

function EditorForm({
  agent,
  existing,
  running,
  onClose,
}: {
  agent: Agent;
  existing: AgentEvalCaseDetail | undefined;
  running: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("eval.tab.editor");
  const [form, setForm] = React.useState<CaseForm>(() => initialForm(existing));
  const [runOnSave, setRunOnSave] = useRunOnSave();
  const { save, error: serverError, pending, born } = useCaseSave({ agentId: agent.id, existing, form, running, onDone: onClose });

  const errors = validateCase(form);
  const valid = errors.length === 0;
  const set = <K extends keyof CaseForm>(key: K, value: CaseForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const last = existing?.last_run;
  const runDisabled = !valid || pending || running;

  return (
    <Modal
      width={980}
      title={existing ? t("title", { name: existing.name }) : t("newTitle")}
      subtitle={t("subtitle", { agent: agent.name })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <label style={s.runOnSave}>
            <Toggle on={runOnSave} onChange={setRunOnSave} size={16} />
            {t("runOnSave")}
          </label>
          <Button kind="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button kind="secondary" icon="Play" disabled={runDisabled} onClick={() => void save(true)}>
            {t("runCase")}
          </Button>
          <Button kind="primary" icon="Check" disabled={!valid || pending} loading={pending} onClick={() => void save(runOnSave)}>
            {pending ? t("saving") : t("save")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.left}>
          <label style={s.label} htmlFor="eval-case-name">
            {t("name")} <span style={s.required}>*</span>
          </label>
          <input
            id="eval-case-name"
            className="mono"
            style={s.input}
            value={form.name}
            placeholder={t("namePlaceholder")}
            onChange={(e) => set("name", e.target.value)}
          />
          <div style={s.label}>{t("input")}</div>
          <InputTabs form={form} set={set} existing={existing} born={born} />
        </div>

        <div style={s.right}>
          <div style={s.rightHead}>
            <span style={s.label}>{t("expected")}</span>
            <span style={s.valid(valid)} role="status">
              {valid ? t("valid") : t("invalid")}
            </span>
          </div>
          <ExpectationFields form={form} set={set} />
          {!valid && form.name + form.diff + form.file + form.startLine !== "" && (
            <ul style={s.errors}>
              {errors.map((e) => (
                <li key={e}>{t(`errors.${e}`)}</li>
              ))}
            </ul>
          )}
          {serverError && (
            <div role="alert" style={s.serverError}>
              {serverError}
            </div>
          )}
          {existing && last && (
            <div style={s.banner(last.status)} role="note">
              <Icon.CheckCircle size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
              <strong>{t("lastRun", { status: last.status })}</strong>
              {" · "}
              {t("lastRunDetail", {
                expected: expectedFindings(existing),
                got: last.findings_matched,
                duration: formatDuration(last.duration_ms),
                cost: formatRunCost(last.cost_usd, false),
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
