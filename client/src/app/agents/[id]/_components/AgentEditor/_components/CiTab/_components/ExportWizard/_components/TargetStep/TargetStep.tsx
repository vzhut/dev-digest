"use client";

import { useTranslations } from "next-intl";
import { Badge, Icon, SelectInput } from "@devdigest/ui";
import type { Repo } from "@devdigest/shared";
import { s } from "./styles";

/** Step 1: where to export. GitHub Actions is the only target; the repo is one of the connected ones. */
export function TargetStep({
  repos,
  repoId,
  onRepo,
}: {
  repos: readonly Repo[];
  repoId: string | null;
  onRepo: (id: string) => void;
}) {
  const t = useTranslations("ci.exportWizard");
  return (
    <div style={s.wrap}>
      <div style={s.card} aria-label={t("targets.gha")}>
        <span style={s.iconBox}>
          <Icon.Workflow size={18} />
        </span>
        <div style={s.cardText}>
          <div style={s.cardTitle}>{t("targets.gha")}</div>
          <div style={s.cardDesc}>{t("targets.ghaDesc")}</div>
        </div>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("recommended")}
        </Badge>
      </div>

      {repos.length === 0 ? (
        <p role="status" style={s.empty}>
          {t("noRepos")}
        </p>
      ) : (
        <label style={s.field}>
          <span style={s.label}>{t("repoLabel")}</span>
          <SelectInput
            mono={false}
            value={repoId ?? ""}
            onChange={onRepo}
            options={repos.map((r) => ({ value: r.id, label: r.full_name }))}
          />
          <span style={s.hint}>{t("repoHint")}</span>
        </label>
      )}
    </div>
  );
}
