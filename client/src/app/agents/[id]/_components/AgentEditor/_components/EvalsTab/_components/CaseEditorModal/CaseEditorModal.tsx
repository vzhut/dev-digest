/* CaseEditorModal — create or edit one eval case: name, the diff the agent will review, and the structured
   expectation (type, file, lines, optional title). Validity mirrors the server; Save stays disabled until the
   form is valid. "Run on save" (default OFF, remembered) and "Run case" start a paid run of just this case. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Modal, Skeleton, Toggle } from "@devdigest/ui";
import type { Agent, AgentEvalCaseDetail } from "@devdigest/shared";
import { apiErrorMessage } from "@/lib/api";
import { formatDuration, formatRunCost } from "@/lib/eval-format";
import { useCreateManualEvalCase, useEvalCase, useStartEvalRun, useUpdateEvalCase } from "@/lib/hooks/eval";
import { notify } from "@/lib/toast";
import { expectedFindings, sourcePrUrl } from "../../helpers";
import { parseDiffFiles, toWriteBody, validateCase, type CaseForm } from "./helpers";
import { useRunOnSave } from "./useRunOnSave";
import { s } from "./styles";

type Tab = "diff" | "files" | "prMeta";

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
  const [tab, setTab] = React.useState<Tab>("diff");
  const [runOnSave, setRunOnSave] = useRunOnSave();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const create = useCreateManualEvalCase(agent.id);
  const update = useUpdateEvalCase(agent.id);
  const start = useStartEvalRun(agent.id);

  const born = existing?.meta.source_finding_id != null;
  const errors = validateCase(form);
  const valid = errors.length === 0;
  const pending = create.isPending || update.isPending;
  const files = parseDiffFiles(form.diff);
  const set = <K extends keyof CaseForm>(key: K, value: CaseForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async (thenRun: boolean) => {
    setServerError(null);
    try {
      const body = toWriteBody(form, born);
      const id = existing
        ? (await update.mutateAsync({ caseId: existing.id, body })).id
        : (await create.mutateAsync(body)).case.id;
      if (thenRun && !running) {
        start.mutate([id], { onError: (e) => notify.error(apiErrorMessage(e, t("saveFailed"))) });
      }
      onClose();
    } catch (e) {
      setServerError(apiErrorMessage(e, t("saveFailed")));
    }
  };

  const last = existing?.last_run;
  const prUrl = existing ? sourcePrUrl(existing.meta) : null;
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
          <div style={s.tabs} role="tablist">
            {(["diff", "files", "prMeta"] as const).map((k) => (
              <button key={k} role="tab" aria-selected={tab === k} style={s.tab(tab === k)} onClick={() => setTab(k)}>
                {t(`tabs.${k}`)}
              </button>
            ))}
          </div>
          {tab === "diff" && (
            <textarea
              className="mono"
              style={s.textarea}
              aria-label={t("tabs.diff")}
              value={form.diff}
              placeholder={t("diffPlaceholder")}
              spellCheck={false}
              onChange={(e) => set("diff", e.target.value)}
            />
          )}
          {tab === "files" && (
            <div>
              <p style={s.hint}>{t("filesHint")}</p>
              {files.length === 0 ? (
                <p style={s.hint}>{t("noFiles")}</p>
              ) : (
                <ul className="mono" style={s.fileList}>
                  {files.map((f) => (
                    <li key={f.path}>{f.path}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {tab === "prMeta" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {born && <p style={s.hint}>{t("prReadOnly")}</p>}
              <div>
                <label style={s.fieldLabel} htmlFor="eval-case-pr-title">
                  {t("prTitle")}
                </label>
                <input id="eval-case-pr-title" style={s.input} value={form.prTitle} readOnly={born} onChange={(e) => set("prTitle", e.target.value)} />
              </div>
              <div>
                <label style={s.fieldLabel} htmlFor="eval-case-pr-body">
                  {t("prBody")}
                </label>
                <textarea id="eval-case-pr-body" style={{ ...s.textarea, minHeight: 120, fontFamily: "inherit" }} value={form.prBody} readOnly={born} onChange={(e) => set("prBody", e.target.value)} />
              </div>
              {prUrl && existing && (
                <a href={prUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
                  {t("openPr", { repo: existing.meta.repo ?? "", number: existing.meta.pr_number ?? 0 })}
                </a>
              )}
            </div>
          )}
        </div>

        <div style={s.right}>
          <div style={s.rightHead}>
            <span style={s.label}>{t("expected")}</span>
            <span style={s.valid(valid)} role="status">
              {valid ? t("valid") : t("invalid")}
            </span>
          </div>
          <div style={s.fields}>
            <div style={s.full}>
              <label style={s.fieldLabel} htmlFor="eval-case-type">
                {t("type")}
              </label>
              <select id="eval-case-type" style={s.input} value={form.type} onChange={(e) => set("type", e.target.value as CaseForm["type"])}>
                <option value="must_find">{t("typeMustFind")}</option>
                <option value="must_not_flag">{t("typeMustNotFlag")}</option>
              </select>
            </div>
            <div style={s.full}>
              <label style={s.fieldLabel} htmlFor="eval-case-file">
                {t("file")}
              </label>
              <input id="eval-case-file" className="mono" style={s.input} value={form.file} onChange={(e) => set("file", e.target.value)} />
            </div>
            <div>
              <label style={s.fieldLabel} htmlFor="eval-case-start">
                {t("startLine")}
              </label>
              <input id="eval-case-start" className="mono" inputMode="numeric" style={s.input} value={form.startLine} onChange={(e) => set("startLine", e.target.value)} />
            </div>
            <div>
              <label style={s.fieldLabel} htmlFor="eval-case-end">
                {t("endLine")}
              </label>
              <input id="eval-case-end" className="mono" inputMode="numeric" style={s.input} value={form.endLine} onChange={(e) => set("endLine", e.target.value)} />
            </div>
            <div style={s.full}>
              <label style={s.fieldLabel} htmlFor="eval-case-title">
                {t("titleOptional")}
              </label>
              <input id="eval-case-title" style={s.input} value={form.title} onChange={(e) => set("title", e.target.value)} />
            </div>
          </div>
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
