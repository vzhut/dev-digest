"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { AgentEvalCaseDetail } from "@devdigest/shared";
import { sourcePrUrl } from "../../../../helpers";
import { parseDiffFiles, type CaseForm } from "../../helpers";
import { s } from "../../styles";

type Tab = "diff" | "files" | "prMeta";

/** The Input area: Diff (editable), Files (derived from the diff) and PR meta (read-only for finding-born cases). */
export function InputTabs({
  form,
  set,
  existing,
  born,
}: {
  form: CaseForm;
  set: <K extends keyof CaseForm>(key: K, value: CaseForm[K]) => void;
  existing: AgentEvalCaseDetail | undefined;
  born: boolean;
}) {
  const t = useTranslations("eval.tab.editor");
  const [tab, setTab] = React.useState<Tab>("diff");
  const files = parseDiffFiles(form.diff);
  const prUrl = existing ? sourcePrUrl(existing.meta) : null;

  return (
    <>
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
        <div style={s.prMeta}>
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
            <textarea
              id="eval-case-pr-body"
              style={{ ...s.textarea, ...s.prBody }}
              value={form.prBody}
              readOnly={born}
              onChange={(e) => set("prBody", e.target.value)}
            />
          </div>
          {prUrl && existing && (
            <a href={prUrl} target="_blank" rel="noopener noreferrer" style={s.link}>
              {t("openPr", { repo: existing.meta.repo ?? "", number: existing.meta.pr_number ?? 0 })}
            </a>
          )}
        </div>
      )}
    </>
  );
}
