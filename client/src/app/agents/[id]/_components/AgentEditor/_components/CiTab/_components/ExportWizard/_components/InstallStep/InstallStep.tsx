"use client";

import { useTranslations } from "next-intl";
import { Badge, Icon, Skeleton } from "@devdigest/ui";
import type { CiInstallResult } from "@devdigest/shared";
import { safeHttpsUrl } from "@/components/ci-runs-table";
import type { InstallMethod } from "../../constants";
import { ErrorNote } from "../ErrorNote";
import { s } from "./styles";

/** Step 4: open a PR (default) or download a .zip; shows the result and any error by code. */
export function InstallStep({
  repoName,
  fileCount,
  method,
  onMethod,
  previewPending,
  previewError,
  violationCount,
  installResult,
  installError,
  zipDone,
  zipError,
}: {
  repoName: string;
  fileCount: number;
  method: InstallMethod;
  onMethod: (m: InstallMethod) => void;
  previewPending: boolean;
  previewError: unknown;
  violationCount: number;
  installResult: CiInstallResult | undefined;
  installError: unknown;
  zipDone: boolean;
  zipError: unknown;
}) {
  const t = useTranslations("ci.exportWizard");
  if (previewError) return <ErrorNote error={previewError} />;
  if (previewPending) {
    return (
      <div role="status" aria-label={t("generating")}>
        <Skeleton height={120} />
      </div>
    );
  }
  const prUrl = safeHttpsUrl(installResult?.pr_url);
  return (
    <div style={s.wrap}>
      <div role="radiogroup" aria-label={t("installMethodLabel")} style={s.methods}>
        <button type="button" role="radio" aria-checked={method === "pr"} style={s.card(method === "pr")} onClick={() => onMethod("pr")}>
          <div style={s.cardHead}>
            <Icon.GitPullRequest size={18} />
            <span style={s.cardTitle}>{t("installCardTitle")}</span>
            <Badge color="var(--accent-text)" bg="var(--bg-elevated)">
              {t("recommended")}
            </Badge>
          </div>
          <p style={s.cardBody}>{t("installCardBody", { repo: repoName, count: fileCount })}</p>
        </button>
        <button type="button" role="radio" aria-checked={method === "zip"} style={s.card(method === "zip")} onClick={() => onMethod("zip")}>
          <div style={s.cardHead}>
            <Icon.Upload size={18} />
            <span style={s.cardTitle}>{t("zipCardTitle")}</span>
          </div>
          <p style={s.cardBody}>{t("zipCardBody", { count: fileCount })}</p>
        </button>
      </div>

      {method === "pr" && violationCount > 0 && (
        <p role="alert" style={s.blocked}>
          {t("installBlocked", { count: violationCount })}
        </p>
      )}
      <p role="note" style={s.note}>
        {t("forkNote")}
      </p>

      {installError != null && <ErrorNote error={installError} />}
      {zipError != null && <ErrorNote error={zipError} />}
      {installResult && (
        <div role="status" style={s.success}>
          <Icon.CheckCircle size={16} />
          <span>{t("installedBody", { repo: repoName })}</span>
          {prUrl && (
            <a href={prUrl} target="_blank" rel="noopener noreferrer" style={s.link}>
              {t("openPr")}
            </a>
          )}
        </div>
      )}
      {zipDone && (
        <div role="status" style={s.success}>
          <Icon.CheckCircle size={16} />
          <span>{t("zipDoneBody")}</span>
        </div>
      )}
    </div>
  );
}
