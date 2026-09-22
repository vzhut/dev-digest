"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Drawer } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import { useConfirmImport, useImportPreview } from "@/lib/hooks/skills";
import { ImportPreview, type ConfirmChoice } from "./_components/ImportPreview";
import { ACCEPTED_FILES, DRAWER_WIDTH } from "./constants";
import { s } from "./styles";

/** Import drawer — upload a .md/.zip, review the preview, then confirm (creating by hand is CreateSkillModal). */
export function AddSkillDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("skills.add");
  const parse = useImportPreview();
  const confirmImport = useConfirmImport();

  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  if (!open) return null;

  const close = () => {
    setPreview(null);
    setError(null);
    onClose();
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
