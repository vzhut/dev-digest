"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Textarea, Toggle, Button } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill, useDeleteSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_TYPES } from "./constants";
import { canSave, formFromSkill, type SkillForm } from "./helpers";
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
  const set =
    <K extends keyof SkillForm>(key: K) =>
    (value: SkillForm[K]) =>
      setForm((f) => ({ ...f, [key]: value }));

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const save = () =>
    update.mutate(
      { id: skill.id, patch: form },
      { onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })) },
    );

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
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={form.enabled} onChange={set("enabled")} size={16} />
        </label>
      </div>
      <FormField label={t("config.name")} required>
        <TextInput value={form.name} onChange={set("name")} />
      </FormField>
      <FormField label={t("config.description")} hint={t("config.descriptionHint")}>
        <TextInput value={form.description} onChange={set("description")} />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput value={form.type} onChange={(v) => set("type")(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField label={t("config.body")} hint={t("config.bodyHint")}>
        <Textarea value={form.body} onChange={set("body")} rows={14} mono />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending || !canSave(form)}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        <Button kind="secondary" icon="Trash" onClick={remove} disabled={del.isPending}>
          {t("config.delete")}
        </Button>
        {update.isSuccess && <span style={s.savedNote}>{t("config.saved", { version: update.data?.version })}</span>}
      </div>
    </div>
  );
}
