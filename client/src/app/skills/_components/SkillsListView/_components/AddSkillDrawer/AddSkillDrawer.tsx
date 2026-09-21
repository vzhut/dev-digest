"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Drawer, FormField, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { SkillImportPreview, SkillType } from "@devdigest/shared";
import { useConfirmImport, useCreateSkill, useImportPreview } from "@/lib/hooks/skills";
import { ImportPreview, type ConfirmChoice } from "./_components/ImportPreview";
import { ACCEPTED_FILES, DEFAULT_SKILL_TYPE, DRAWER_WIDTH, TYPE_OPTIONS } from "./constants";
import { s } from "./styles";

type Mode = "manual" | "import";

/** Add-skill drawer — create by hand, or import a .md/.zip through a preview step. */
export function AddSkillDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("skills.add");
  const tType = useTranslations("skills.listItem.type");
  const create = useCreateSkill();
  const parse = useImportPreview();
  const confirmImport = useConfirmImport();

  const [mode, setMode] = React.useState<Mode>("manual");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_SKILL_TYPE);
  const [body, setBody] = React.useState("");
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  if (!open) return null;

  const close = () => {
    setPreview(null);
    setError(null);
    onClose();
  };

  const submitManual = async () => {
    setError(null);
    try {
      await create.mutateAsync({ name: name.trim(), description, type, body });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("failed"));
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      setPreview(await parse.mutateAsync(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
    }
  };

  const onConfirm = async (choice: ConfirmChoice) => {
    if (!preview) return;
    setError(null);
    try {
      await confirmImport.mutateAsync({
        name: choice.name,
        description: preview.description,
        type: preview.type,
        body: preview.body,
        ...(choice.on_conflict ? { on_conflict: choice.on_conflict } : {}),
      });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
    }
  };

  return (
    <Drawer width={DRAWER_WIDTH} title={t("title")} subtitle={t("subtitle")} onClose={close}>
      {preview ? (
        <ImportPreview
          preview={preview}
          pending={confirmImport.isPending}
          error={error}
          onConfirm={onConfirm}
          onCancel={() => {
            setPreview(null);
            setError(null);
          }}
        />
      ) : (
        <>
          <div style={s.modes}>
            <Button kind={mode === "manual" ? "primary" : "secondary"} onClick={() => setMode("manual")}>
              {t("modeManual")}
            </Button>
            <Button kind={mode === "import" ? "primary" : "secondary"} onClick={() => setMode("import")}>
              {t("modeImport")}
            </Button>
          </div>
          {mode === "manual" ? (
            <div style={s.form}>
              <FormField label={t("name")} required>
                <TextInput value={name} onChange={setName} placeholder={t("namePlaceholder")} mono />
              </FormField>
              <FormField label={t("description")} hint={t("descriptionHint")}>
                <TextInput value={description} onChange={setDescription} />
              </FormField>
              <FormField label={t("type")}>
                <SelectInput
                  value={type}
                  onChange={(v) => setType(v as SkillType)}
                  options={TYPE_OPTIONS.map((v) => ({ value: v, label: tType(v) }))}
                />
              </FormField>
              <FormField label={t("body")}>
                <Textarea value={body} onChange={setBody} rows={10} mono />
              </FormField>
              <div style={s.footer}>
                <Button kind="ghost" onClick={close}>
                  {t("cancel")}
                </Button>
                <Button
                  kind="primary"
                  icon="Plus"
                  onClick={submitManual}
                  disabled={create.isPending || name.trim().length === 0}
                >
                  {create.isPending ? t("creating") : t("create")}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <label htmlFor="skill-file" style={{ fontSize: 13, fontWeight: 600 }}>
                {t("pickFile")}
              </label>
              <input
                id="skill-file"
                type="file"
                accept={ACCEPTED_FILES}
                onChange={onFile}
                style={{ display: "block", marginTop: 8 }}
              />
              <p style={s.hint}>{parse.isPending ? t("parsing") : t("fileHint")}</p>
            </div>
          )}
          {error && (
            <div role="alert" style={s.error}>
              {error}
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}
