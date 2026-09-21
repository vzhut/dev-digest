"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillVersions, useRestoreSkillVersion } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { diffLines, hasChanges } from "./helpers";
import { s } from "./styles";

const PREFIX = { same: "  ", add: "+ ", del: "- " } as const;

/** Versions tab — history (newest first), diff against the current body, restore. */
export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [open, setOpen] = React.useState<number | null>(null);

  const doRestore = (version: number) =>
    restore.mutate({ id: skill.id, version }, { onSuccess: () => toast.success(t("versions.restored")) });

  const older = (versions ?? []).filter((v) => v.version !== skill.version);

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <h2 style={s.h2}>{t("versions.title")}</h2>
        <Badge>{t("versions.count", { count: older.length + 1 })}</Badge>
      </div>
      <p style={s.subtitle}>{t("versions.subtitle")}</p>
      <div style={s.list}>
        <div style={s.card}>
          <div style={s.row}>
            <span style={{ ...s.chip, ...s.chipCurrent }} className="mono">
              {t("versions.version", { version: skill.version })}
            </span>
            <div style={s.text}>
              <div style={skill.message ? s.title : s.titleMuted}>{skill.message || t("versions.noMessage")}</div>
            </div>
            <Badge dot color="var(--ok)">
              {t("versions.current")}
            </Badge>
          </div>
        </div>
        {isLoading && <Skeleton height={44} />}
        {!isLoading && older.length === 0 && <p style={s.muted}>{t("versions.empty")}</p>}
        {older.map((v) => {
          const isOpen = open === v.version;
          const lines = isOpen ? diffLines(v.body, skill.body) : [];
          return (
            <div key={v.version} style={s.card}>
              <div style={s.row}>
                <span style={s.chip} className="mono">
                  {t("versions.version", { version: v.version })}
                </span>
                <div style={s.text}>
                  <div style={v.message ? s.title : s.titleMuted}>{v.message || t("versions.noMessage")}</div>
                  <div style={s.date}>{v.created_at.slice(0, 10)}</div>
                </div>
                <div style={s.actions}>
                  <Button kind="ghost" size="sm" icon="Eye" onClick={() => setOpen(isOpen ? null : v.version)}>
                    {isOpen ? t("versions.hide") : t("versions.view")}
                  </Button>
                  <Button
                    kind="secondary"
                    size="sm"
                    icon="History"
                    disabled={restore.isPending}
                    onClick={() => doRestore(v.version)}
                  >
                    {restore.isPending ? t("versions.restoring") : t("versions.restore")}
                  </Button>
                </div>
              </div>
              {isOpen && (
                <div style={s.diff} className="mono">
                  <div style={s.diffTitle}>{t("versions.diffTitle", { version: v.version })}</div>
                  {hasChanges(lines) ? (
                    lines.map((l, i) => (
                      <div key={i} style={s.line(l.kind)}>
                        {PREFIX[l.kind]}
                        {l.text}
                      </div>
                    ))
                  ) : (
                    <div>{t("versions.noChanges")}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
