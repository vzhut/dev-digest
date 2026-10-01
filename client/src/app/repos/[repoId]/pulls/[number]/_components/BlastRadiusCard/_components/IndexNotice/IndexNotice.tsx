"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { BlastDegradedReason, BlastIndexStatus } from "@devdigest/shared";
import { useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { s } from "./styles";

/** The "index incomplete" marker shown when the map may be missing callers,
    plus a resync affordance so the user can trigger a refresh without
    leaving the PR. */
export function IndexNotice({
  reasonKey,
  indexStatus,
  repoId,
  onResynced,
}: {
  reasonKey: BlastDegradedReason;
  indexStatus: BlastIndexStatus | null;
  repoId: string;
  /** Called once the index has actually advanced after a resync, so the
      caller can refetch its own blast query. */
  onResynced?: () => void;
}) {
  const t = useTranslations("blast");
  const { resync, phase, isResyncing } = useResyncRepoIntel(repoId, onResynced);

  return (
    <div role="status" style={s.notice}>
      <Icon.AlertTriangle size={14} style={s.icon} />
      <div style={s.body}>
        <span>
          {t("incomplete.title")}
          {indexStatus && ` ${t("incomplete.status", { status: indexStatus })}`}: {t(`incomplete.reason.${reasonKey}`)}.
        </span>
        <div style={s.resyncRow}>
          <button
            type="button"
            style={s.resyncButton}
            onClick={() => resync()}
            disabled={isResyncing || phase === "queued"}
          >
            <Icon.RefreshCw size={12} />
            {t("resync.button")}
          </button>
          {phase === "pending" && <span style={s.resyncStatus}>{t("resync.pending")}</span>}
          {phase === "queued" && <span style={s.resyncStatus}>{t("resync.queued")}</span>}
          {phase === "failed" && <span style={s.resyncStatus}>{t("resync.failed")}</span>}
        </div>
      </div>
    </div>
  );
}
