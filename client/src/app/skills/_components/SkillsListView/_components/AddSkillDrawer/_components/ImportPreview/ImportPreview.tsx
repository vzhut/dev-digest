"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, TextInput } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import { s } from "./styles";

export interface ConfirmChoice {
  name: string;
  on_conflict?: "update";
}

function FileList({ label, files, empty }: { label: string; files: string[]; empty: string }) {
  return (
    <div>
      <div style={s.label}>
        {label} ({files.length})
      </div>
      {files.length === 0 ? (
        <div style={s.note}>{empty}</div>
      ) : (
        <ul style={s.list}>
          {files.map((f) => (
            <li key={f} className="mono">
              {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Preview of a parsed upload — nothing is persisted until the user confirms. */
export function ImportPreview({
  preview,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  preview: SkillImportPreview;
  pending?: boolean;
  error?: string | null;
  onConfirm: (choice: ConfirmChoice) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("skills.add.preview");
  const tAdd = useTranslations("skills.add");
  const [name, setName] = React.useState(preview.name);
  const [update, setUpdate] = React.useState(false);

  const taken = preview.name_taken;
  const renamedStillTaken = taken && !update && name.trim() === preview.name;
  const canConfirm = !pending && name.trim().length > 0 && !renamedStillTaken;

  const confirm = () =>
    onConfirm(update ? { name: preview.name, on_conflict: "update" } : { name: name.trim() });

  return (
    <div style={s.root}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{preview.name}</div>
        {preview.description && <div style={s.note}>{preview.description}</div>}
      </div>

      <FileList label={t("included")} files={preview.included_files} empty={t("none")} />
      <div>
        <FileList label={t("ignored")} files={preview.ignored_files} empty={t("none")} />
        <p style={s.note}>{t("ignoredNote")}</p>
      </div>

      {taken && (
        <div role="alert" style={s.warn}>
          <p style={{ margin: "0 0 8px" }}>{t("nameTaken", { name: preview.name })}</p>
          <label style={s.choice}>
            <input type="checkbox" checked={update} onChange={(e) => setUpdate(e.target.checked)} />
            {t("updateExisting")}
          </label>
          {!update && (
            <FormField label={t("renameLabel")}>
              <TextInput value={name} onChange={setName} mono />
            </FormField>
          )}
        </div>
      )}

      <p style={s.note}>{t("disabledNotice")}</p>
      {error && (
        <div role="alert" style={s.warn}>
          {error}
        </div>
      )}

      <div style={s.footer}>
        <Button kind="ghost" onClick={onCancel} disabled={pending}>
          {tAdd("cancel")}
        </Button>
        <Button kind="primary" onClick={confirm} disabled={!canConfirm}>
          {pending ? t("confirming") : update ? t("confirmUpdate") : t("confirm")}
        </Button>
      </div>
    </div>
  );
}
