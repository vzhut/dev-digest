"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { CiInstallation, CiRunItem } from "@devdigest/shared";
import { resultOf, safeHttpsUrl } from "@/components/ci-runs-table";
import { formatRunStamp } from "@/lib/eval-format";
import { s } from "./styles";

/** One repo this agent is exported to: target, installed versions, status, and the last CI run there. */
export function InstallationRow({
  installation,
  outdated,
  lastRun,
}: {
  installation: CiInstallation;
  outdated: boolean;
  lastRun: CiRunItem | undefined;
}) {
  const t = useTranslations("ci");
  const prUrl = safeHttpsUrl(installation.pr_url);
  const active = installation.status === "active";
  return (
    <li style={s.row}>
      <div style={s.main}>
        <span className="mono" style={s.repo}>
          {installation.repo}
        </span>
        <span style={s.meta}>
          {t("exportWizard.targets.gha")} · {t("ciTab.versions", { agent: installation.manifest_version, workflow: installation.workflow_version })}
        </span>
      </div>
      <div style={s.badges}>
        <Badge color={active ? "var(--ok)" : "var(--warn)"} bg={active ? "var(--ok-bg)" : "var(--warn-bg)"} dot>
          {t(`ciTab.status.${installation.status}`)}
        </Badge>
        {outdated && (
          <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
            {t("ciTab.outdated")}
          </Badge>
        )}
      </div>
      <div style={s.last}>
        {lastRun ? t("ciTab.lastRun", { when: formatRunStamp(lastRun.ran_at), result: t(`runs.result.${resultOf(lastRun)}`) }) : t("ciTab.noRuns")}
      </div>
      {!active && prUrl && (
        <a href={prUrl} target="_blank" rel="noopener noreferrer" style={s.link}>
          {t("ciTab.openPr")}
        </a>
      )}
    </li>
  );
}
