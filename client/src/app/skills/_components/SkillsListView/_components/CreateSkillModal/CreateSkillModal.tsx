/* CreateSkillModal — create a skill by hand: name, description, type and a Markdown body. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill } from "@/lib/hooks/skills";
import { BODY_ROWS, DEFAULT_SKILL_TYPE, MODAL_WIDTH, TYPE_OPTIONS } from "./constants";
import { s } from "./styles";

export function CreateSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills.add");
  const tType = useTranslations("skills.listItem.type");
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_SKILL_TYPE);
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      await create.mutateAsync({ name: name.trim(), description, type, body });
      onClose();
    } catch (e) {
      // 409 (name already taken) and any other server error surface inline.
      setError(e instanceof Error ? e.message : t("failed"));
    }
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("createTitle")}
      subtitle={t("createSubtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={create.isPending || name.trim().length === 0}>
            {create.isPending ? t("creating") : t("create")}
          </Button>
        </div>
      }
    >
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
          <Textarea value={body} onChange={setBody} rows={BODY_ROWS} mono />
        </FormField>
        {error && (
          <div role="alert" style={s.error}>
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
