/* Skill editor view — /skills/:id. Left: skill list; right: the editor for the
   selected skill. Tab state lives in ?tab=. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button, ErrorState, Skeleton, Icon, Badge } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkills, useSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { apiErrorMessage } from "@/lib/api";
import { useSetSearchParam } from "@/lib/search-params";
import { SkillCard } from "../../../_components/SkillCard";
import { SkillEditor } from "../SkillEditor";
import { TABS } from "../SkillEditor/constants";
import { s } from "./styles";

export function SkillEditorView() {
  const t = useTranslations("skills");
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const setParam = useSetSearchParam();
  const { id } = params;

  const { data: skills } = useSkills();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const update = useUpdateSkill();

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

  return (
    <AppShell crumb={crumb}>
      <div style={s.layout}>
        <div style={s.sidebar}>
          <div style={s.sidebarHead}>
            <div style={s.sidebarTitleRow}>
              <h1 style={s.sidebarTitle}>{t("editor.listTitle")}</h1>
              <Button kind="primary" size="sm" icon="Plus" onClick={() => router.push("/skills")}>
                {t("editor.add")}
              </Button>
            </div>
          </div>
          <div style={s.sidebarList}>
            {(skills ?? []).map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === id}
                onClick={() => router.push(`/skills/${sk.id}?tab=${tab}`)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        </div>

        {isLoading || !skill ? (
          <div style={s.loading}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={s.editor}>
            <div style={s.editorHead}>
              <Icon.Sparkles size={18} style={s.editorIcon} />
              <h1 style={s.editorTitle}>{skill.name}</h1>
              <Badge color="var(--text-secondary)" mono>
                {t("preview.version", { version: skill.version })}
              </Badge>
              {!skill.enabled && <Badge color="var(--text-muted)">{t("preview.disabled")}</Badge>}
            </div>
            <div style={s.editorBody}>
              <SkillEditor skill={skill} tab={tab} onTab={setTab} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
