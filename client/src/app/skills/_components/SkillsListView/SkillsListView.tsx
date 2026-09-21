/* Skills Lab two-column layout. Left: heading, "Add Skill", search and the SkillCard list;
   right: `detail` (the editor) or an empty pane. Selecting a card navigates to /skills/:id. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill, useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { ConfirmModal } from "@/components/confirm-modal";
import { SkillCard } from "../SkillCard";
import { AddSkillDrawer } from "./_components/AddSkillDrawer";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsListView({
  activeId,
  tab = "config",
  crumbTail,
  detail,
}: {
  activeId?: string;
  tab?: string;
  crumbTail?: string;
  detail?: React.ReactNode;
}) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const toast = useToast();
  const [deleting, setDeleting] = React.useState<Skill | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const list = filterSkills(skills ?? [], search);
  const crumb = [
    { label: t("page.crumbLab") },
    crumbTail ? { label: t("page.crumbSkills"), href: "/skills" } : { label: t("page.crumbSkills") },
    ...(crumbTail ? [{ label: crumbTail }] : []),
  ];

  return (
    <AppShell crumb={crumb}>
      <AddSkillDrawer open={adding} onClose={() => setAdding(false)} />
      {deleting && (
        <ConfirmModal
          title={t("card.deleteTitle")}
          body={t("config.confirmDelete", { name: deleting.name })}
          confirmLabel={t("card.deleteConfirm")}
          pending={del.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            del.mutate(deleting.id, {
              onSuccess: () => {
                toast.success(t("config.deleted"));
                if (deleting.id === activeId) router.push("/skills");
                setDeleting(null);
              },
            })
          }
        />
      )}
      <div style={s.layout}>
        <div style={s.list}>
          <div style={s.header}>
            <h1 style={s.h1}>{t("page.heading")}</h1>
            <Button kind="primary" size="sm" icon="Plus" onClick={() => setAdding(true)}>
              {t("page.addSkill")}
              <Icon.ChevronDown size={13} style={s.addChevron} />
            </Button>
          </div>
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("page.searchPlaceholder")}
              aria-label={t("page.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>

          {isLoading && (
            <div>
              <Skeleton height={110} />
              <Skeleton height={110} />
              <Skeleton height={110} />
            </div>
          )}
          {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
          {!isLoading && !isError && list.length === 0 && (
            <EmptyState
              icon="Sparkles"
              title={t("page.empty.title")}
              body={t("page.empty.body")}
              cta={t("page.empty.cta")}
              onCta={() => setAdding(true)}
            />
          )}
          {list.length > 0 && (
            <div style={s.cards}>
              {list.map((sk) => (
                <SkillCard
                  key={sk.id}
                  skill={sk}
                  active={sk.id === activeId}
                  onClick={() => router.push(`/skills/${sk.id}?tab=${tab}`)}
                  onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                  onDelete={() => setDeleting(sk)}
                />
              ))}
            </div>
          )}
        </div>
        <div style={s.detail}>
          {detail ?? (
            <div style={s.detailEmpty}>
              <EmptyState icon="Sparkles" title={t("page.selectPrompt.title")} body={t("page.selectPrompt.body")} />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
