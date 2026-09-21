"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Toggle, Button, Badge } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill, useDeleteSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_TYPES } from "./constants";
import { canSave, formFromSkill, isDirty, type SkillForm } from "./helpers";
import { SkillBodyEditor } from "./_components/SkillBodyEditor";
import { s } from "./styles";

/** Config tab — name, directive description, type, markdown body, global enabled, save/delete. */
export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  // Parent keys this component by skill id + version, so it remounts with fresh values.
  const [form, setForm] = React.useState(() => formFromSkill(skill));
  const [message, setMessage] = React.useState("");
  const dirty = isDirty(form, skill);
  const bodyChanged = form.body !== skill.body;
  const set =
    <K extends keyof SkillForm>(key: K) =>
    (value: SkillForm[K]) =>
      setForm((f) => ({ ...f, [key]: value }));

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const cancel = () => {
    setForm(formFromSkill(skill));
    setMessage("");
  };

  const save = () => {
    const trimmed = message.trim();
    update.mutate(
      { id: skill.id, patch: { ...form, ...(trimmed ? { message: trimmed } : {}) } },
      {
        onSuccess: (data) => {
          setMessage("");
          toast.success(t("config.savedToast", { version: data.version }));
        },
      },
    );
  };

  const remove = () => {
    if (!window.confirm(t("config.confirmDelete", { name: skill.name }))) return;
    del.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("config.deleted"));
        router.push("/skills");
      },
    });
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <Badge icon="GitCommit" mono>
          v{skill.version}
        </Badge>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={form.enabled} onChange={set("enabled")} size={16} />
        </label>
      </div>
      <FormField label={t("config.name")} required>
        <TextInput value={form.name} onChange={set("name")} mono />
      </FormField>
      <FormField label={t("config.description")} hint={t("config.descriptionHint")}>
        <TextInput value={form.description} onChange={set("description")} />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput value={form.type} onChange={(v) => set("type")(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField label={t("config.body")} hint={t("config.bodyHint")} required>
        <SkillBodyEditor name={form.name} value={form.body} unsaved={bodyChanged} onChange={set("body")} />
      </FormField>
      {dirty && (
        <FormField label={t("config.message")} hint={t("config.messageHint")}>
          <TextInput value={message} onChange={setMessage} placeholder={t("config.messagePlaceholder")} />
        </FormField>
      )}
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending || !dirty || !canSave(form)}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        {dirty && (
          <Button kind="secondary" onClick={cancel} disabled={update.isPending}>
            {t("config.cancel")}
          </Button>
        )}
        {bodyChanged && (
          <span style={s.snapshotNote}>
            {t.rich("config.snapshotHint", {
              version: skill.version + 1,
              b: (chunks) => <strong style={s.strong}>{chunks}</strong>,
            })}
          </span>
        )}
      </div>
      <div style={s.danger}>
        <div>
          <div style={s.dangerTitle}>{t("config.deleteTitle")}</div>
          <div style={s.dangerText}>{t("config.deleteHint")}</div>
        </div>
        <Button kind="danger" icon="Trash" onClick={remove} disabled={del.isPending} style={s.dangerBtn}>
          {t("config.delete")}
        </Button>
      </div>
    </div>
  );
}
