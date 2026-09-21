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

  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("versions.title")}</h2>
      <div style={s.row}>
        <Badge mono>{t("versions.version", { version: skill.version })}</Badge>
        <Badge color="var(--ok)">{t("versions.current")}</Badge>
        {skill.message && <span style={s.rowMessage}>{skill.message}</span>}
      </div>
      {isLoading && <Skeleton height={44} />}
      {!isLoading && (versions ?? []).length === 0 && <p style={s.muted}>{t("versions.empty")}</p>}
      {(versions ?? [])
        .filter((v) => v.version !== skill.version)
        .map((v) => {
          const lines = open === v.version ? diffLines(v.body, skill.body) : [];
          return (
            <div key={v.version}>
              <div style={s.row}>
                <Badge mono>{t("versions.version", { version: v.version })}</Badge>
                <span style={s.rowDate}>{new Date(v.created_at).toLocaleString()}</span>
                <span style={s.rowMessage}>{v.message || t("versions.noMessage")}</span>
                <Button kind="ghost" size="sm" onClick={() => setOpen(open === v.version ? null : v.version)}>
                  {open === v.version ? t("versions.hide") : t("versions.view")}
                </Button>
                <Button kind="secondary" size="sm" disabled={restore.isPending} onClick={() => doRestore(v.version)}>
                  {restore.isPending ? t("versions.restoring") : t("versions.restore")}
                </Button>
              </div>
              {open === v.version && (
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
  );
}
