/* Conventions Extractor view — /repos/:repoId/conventions. Run Scan / ReScan,
   the scan's quality line, the accept/reject/edit toolbar, the candidate
   list, and Create skill (C16: hidden, not disabled, until ≥1 accepted). */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { apiErrorMessage, ApiError } from "@/lib/api";
import { relativeTime } from "@/lib/relative-time";
import { useConventions, useExtractConventions, useUpdateConvention } from "@/lib/hooks/conventions";
import { SKELETON_CARDS } from "./constants";
import { acceptedSummary, dropReasonEntries, totalDropped } from "./helpers";
import { s } from "./styles";
import { ConventionCard } from "./_components/ConventionCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { data, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [showCreateSkill, setShowCreateSkill] = React.useState(false);

  const repoName = activeRepo?.full_name ?? repoId;

  if (repoNotFound) {
    return (
      <AppShell crumb={[{ label: repoName, mono: true }, { label: t("page.crumbLab") }, { label: t("page.crumbConventions") }]}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const extractErrorCode = extract.error instanceof ApiError ? extract.error.code : undefined;
  const extractGuidance =
    extractErrorCode === "not_cloned" ? t("page.notCloned") : extractErrorCode === "not_indexed" ? t("page.notIndexed") : null;

  function runScan() {
    extract.mutate();
  }

  function patch(id: string, body: { status?: "accepted" | "rejected" | "pending"; rule?: string }) {
    setBusyId(id);
    update.mutate({ id, ...body }, { onSettled: () => setBusyId((cur) => (cur === id ? null : cur)) });
  }

  async function selectAll() {
    const pending = (data?.candidates ?? []).filter((c) => c.status === "pending");
    await Promise.all(pending.map((c) => update.mutateAsync({ id: c.id, status: "accepted" })));
  }
  async function deselectAll() {
    const accepted = (data?.candidates ?? []).filter((c) => c.status === "accepted");
    await Promise.all(accepted.map((c) => update.mutateAsync({ id: c.id, status: "pending" })));
  }

  const scan = data?.scan ?? null;
  const candidates = data?.candidates ?? [];
  const summary = acceptedSummary(candidates);
  const dropped = dropReasonEntries(scan);
  const droppedTotal = totalDropped(scan);

  return (
    <AppShell crumb={[{ label: repoName, mono: true }, { label: t("page.crumbLab") }, { label: t("page.crumbConventions") }]}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>{t("page.headingPrefix") + (activeRepo?.full_name ?? t("page.repoFallback"))}</h1>
          <p style={s.pageSubtitle}>{t("page.subtitle")}</p>
          {scan && (
            <p style={s.qualityLine}>
              {t("page.detectedFrom", { count: scan.sample_files, when: relativeTime(scan.created_at) })}
              {" · "}
              {t("page.qualityLine", {
                kept: scan.kept_count,
                raw: scan.raw_count,
                dropped: droppedTotal,
                reasons: dropped.map((d) => `${d.count} ${t(`page.dropReasons.${d.key}` as never)}`).join(", "),
              })}
            </p>
          )}
        </div>
        <div style={s.headerActions}>
          {scan && (
            <Button kind="secondary" icon="RefreshCw" onClick={runScan} loading={extract.isPending}>
              {extract.isPending ? t("page.scanning") : t("page.rescan")}
            </Button>
          )}
        </div>
      </div>

      {extractGuidance && (
        <div style={s.errorBand}>
          <ErrorState title={t("page.extractionFailed")} body={extractGuidance} onRetry={runScan} />
        </div>
      )}
      {!extractGuidance && extract.isError && (
        <div style={s.errorBand}>
          <ErrorState title={t("page.extractionFailed")} body={apiErrorMessage(extract.error, t("page.extractionFailed"))} onRetry={runScan} />
        </div>
      )}

      {isLoading ? (
        <div style={s.loadingStack}>
          {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
            <Skeleton key={i} height={140} />
          ))}
        </div>
      ) : isError ? (
        <div style={s.contentBand}>
          <ErrorState title={t("page.loadError")} body={apiErrorMessage(error, t("page.loadError"))} onRetry={() => refetch()} />
        </div>
      ) : !scan ? (
        <div style={s.contentBand}>
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={runScan}
            ctaLoading={extract.isPending}
          />
        </div>
      ) : candidates.length === 0 ? (
        <div style={s.contentBand}>
          <EmptyState icon="Sparkles" title={t("page.zeroResult.title")} body={t("page.zeroResult.body")} />
        </div>
      ) : (
        <>
          <div style={s.toolbar}>
            <span style={s.toolbarCount}>{t("toolbar.acceptedOf", summary)}</span>
            <Button kind="tertiary" size="sm" onClick={selectAll}>
              {t("toolbar.selectAll")}
            </Button>
            <Button kind="tertiary" size="sm" onClick={deselectAll}>
              {t("toolbar.deselectAll")}
            </Button>
            <div style={s.toolbarSpacer} />
            {summary.accepted > 0 && (
              <Button kind="primary" icon="Sparkles" onClick={() => setShowCreateSkill(true)}>
                {t("toolbar.createSkill")}
              </Button>
            )}
          </div>
          <div style={s.list}>
            {candidates.map((c) => (
              <ConventionCard
                key={c.id}
                candidate={c}
                busy={busyId === c.id}
                onAccept={() => patch(c.id, { status: "accepted" })}
                onReject={() => patch(c.id, { status: "rejected" })}
                onUndo={() => patch(c.id, { status: "pending" })}
                onSaveRule={(rule) => patch(c.id, { rule })}
              />
            ))}
          </div>
        </>
      )}

      {showCreateSkill && repoId && <CreateSkillModal repoId={repoId} onClose={() => setShowCreateSkill(false)} />}
    </AppShell>
  );
}
