"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { useActiveRepo } from "@/lib/repo-context";
import { useContextDocs, useSkillContext, useSaveSkillContext } from "@/lib/hooks/context";
import { buildChecklistRows, toPaths } from "@/lib/context-docs";
import { useToast } from "@/lib/toast";
import { ContextChecklist } from "@/components/context-checklist";
import { DocPreview } from "@/components/doc-preview";
import { pathsChanged, serializedLines } from "./helpers";
import { s } from "./styles";

/** "Project context to use" — docs every agent using this skill inherits. Saving never bumps the skill version. */
export function ProjectContextSection({ skillId }: { skillId: string }) {
  const t = useTranslations("skills.projectContext");
  const toast = useToast();
  const { repoId } = useActiveRepo();
  const docs = useContextDocs(repoId);
  const saved = useSkillContext(skillId);
  const save = useSaveSkillContext(skillId);
  // null = no local edit yet; the checklist follows the saved paths.
  const [draft, setDraft] = React.useState<string[] | null>(null);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  const savedPaths = saved.data?.paths ?? [];
  const paths = draft ?? savedPaths;
  const dirty = draft !== null && pathsChanged(draft, savedPaths);
  const rows = buildChecklistRows(docs.data?.files ?? [], paths);

  const onSave = () =>
    save.mutate(paths, {
      onSuccess: () => {
        setDraft(null);
        toast.success(t("saved"));
      },
    });

  return (
    <section style={s.wrap} aria-label={t("title")}>
      <h3 style={s.h3}>{t("title")}</h3>
      <p style={s.note}>{t("inheritNote")}</p>
      {!repoId ? (
        <p style={s.note}>{t("noRepo")}</p>
      ) : (
        <ContextChecklist
          rows={rows}
          onChange={(next) => setDraft(toPaths(next))}
          onPreview={setPreviewPath}
          isLoading={docs.isLoading || saved.isLoading}
          isError={docs.isError || saved.isError}
          onRetry={() => {
            docs.refetch();
            saved.refetch();
          }}
          roots={docs.data?.roots ?? []}
        />
      )}
      {repoId && previewPath && (
        <div style={s.preview}>
          <DocPreview repoId={repoId} path={previewPath} />
        </div>
      )}
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={onSave} disabled={!dirty || save.isPending}>
          {save.isPending ? t("saving") : t("save")}
        </Button>
        <span style={s.note}>{t("noVersion")}</span>
      </div>
      <div style={s.panel} aria-label={t("serializes.title")}>
        <div style={s.panelTitle}>{t("serializes.title")}</div>
        <pre className="mono" style={s.pre}>
          {serializedLines(paths, (path) => t("serializes.line", { path })).join("\n")}
        </pre>
        <p style={s.note}>{t("serializes.note")}</p>
      </div>
    </section>
  );
}
