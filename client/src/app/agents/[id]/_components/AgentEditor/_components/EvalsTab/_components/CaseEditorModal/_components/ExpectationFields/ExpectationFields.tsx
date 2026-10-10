"use client";

import { useTranslations } from "next-intl";
import type { CaseForm } from "../../helpers";
import { s } from "../../styles";

/** The structured expectation: type, file, start / end line and an optional title. */
export function ExpectationFields({
  form,
  set,
}: {
  form: CaseForm;
  set: <K extends keyof CaseForm>(key: K, value: CaseForm[K]) => void;
}) {
  const t = useTranslations("eval.tab.editor");
  return (
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
  );
}
