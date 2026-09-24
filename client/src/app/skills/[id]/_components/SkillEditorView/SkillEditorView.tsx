/* Skill editor view — /skills/:id. Left: skill list; right: the editor for the
   selected skill. Tab state lives in ?tab=. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useParams, useSearchParams } from "next/navigation";
import { ErrorState, Skeleton, Icon, Badge } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkill } from "@/lib/hooks/skills";
import { apiErrorMessage } from "@/lib/api";
import { useSetSearchParam } from "@/lib/search-params";
import { typeTint } from "../../../_components/SkillCard/helpers";
import { SkillsListView } from "../../../_components/SkillsListView";
import { SkillEditor } from "../SkillEditor";
import { TABS } from "../SkillEditor/constants";
import { s } from "./styles";

export function SkillEditorView() {
  const t = useTranslations("skills");
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const setParam = useSetSearchParam();
  const { id } = params;

  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);

  const requested = search.get("tab") ?? "";
  const tab = TABS.some((tb) => tb.key === requested) ? requested : "config";
  const setTab = (next: string) => setParam("tab", next);

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? t("editor.skillFallback") },
  ];

  if (isError || (!isLoading && !skill)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("detail.notFound.title")}
          body={apiErrorMessage(error, t("detail.notFound.body"))}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  const tint = skill ? typeTint(skill.type) : null;
  const detail =
    isLoading || !skill || !tint ? (
      <div style={s.loading}>
        <Skeleton height={24} width={240} />
        <Skeleton height={200} />
      </div>
    ) : (
      <div style={s.editor}>
        <div style={s.editorHead}>
          <div style={s.editorIcon(tint.fg, tint.bg)}>
            <Icon.Sparkles size={17} />
          </div>
          <h1 style={s.editorTitle}>{skill.name}</h1>
          <Badge color={tint.fg} bg={tint.bg}>
            {t(`listItem.type.${skill.type}`)}
          </Badge>
          <Badge color="var(--text-secondary)" icon="GitCommit" mono>
            {t("preview.version", { version: skill.version })}
          </Badge>
          {!skill.enabled && <Badge color="var(--text-muted)">{t("preview.disabled")}</Badge>}
        </div>
        <div style={s.editorBody}>
          <SkillEditor skill={skill} tab={tab} onTab={setTab} />
        </div>
      </div>
    );

  return <SkillsListView activeId={id} tab={tab} crumbTail={skill?.name ?? t("editor.skillFallback")} detail={detail} />;
}
