/* Onboarding Tour view — /repos/:repoId/onboarding. States: loading / error + retry /
   not cloned / no tour / generating / ready (header, notices, "On this page" nav, five cards).
   Reading never generates; the user starts a generation explicitly. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { apiErrorMessage } from "@/lib/api";
import { pageMode } from "./helpers";
import { s } from "./styles";
import { useTourPage } from "./useTourPage";
import { TourSections } from "../TourSections";
import { TourBanners } from "./_components/TourBanners";
import { TourEmpty } from "./_components/TourEmpty";
import { TourHeader } from "./_components/TourHeader";
import { TourToc } from "./_components/TourToc";

export function OnboardingTourView() {
  const t = useTranslations("onboarding.page");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { query, data, generating, generate, share, select, activeId } = useTourPage(repoId);

  const repoName = activeRepo?.full_name ?? repoId;
  const crumb = [{ label: repoName, mono: true }, { label: t("title") }];

  // The live region stays mounted so screen readers announce the text when it appears.
  const progress = (
    <div role="status" aria-live="polite">
      {generating && (
        <div style={s.progress}>
          <span style={s.spin}>
            <Icon.RefreshCw size={15} />
          </span>
          {t("generating")}
        </div>
      )}
    </div>
  );

  let body: React.ReactNode;
  if (repoNotFound) {
    body = <RepoNotFound />;
  } else if (query.isLoading) {
    body = (
      <div style={{ ...s.band, ...s.skeletons }} role="status" aria-label={t("loading")}>
        <Skeleton height={32} width="40%" />
        <Skeleton height={140} />
        <Skeleton height={140} />
      </div>
    );
  } else if (query.isError || !data) {
    body = (
      <div style={s.band}>
        <ErrorState title={t("error.title")} body={apiErrorMessage(query.error, "")} onRetry={() => query.refetch()} />
      </div>
    );
  } else if (pageMode(data) === "tour" && data.tour) {
    const tour = data.tour;
    body = (
      <div style={s.page}>
        <TourToc activeId={activeId} onSelect={select} />
        <div style={s.scroll}>
          <div style={s.column}>
            <TourHeader
              tour={tour}
              repoFullName={repoName}
              generating={generating}
              onRegenerate={generate}
              onShare={share}
            />
            {progress}
            <TourBanners tour={tour} indexSha={data.index_sha} busy={generating} onRegenerate={generate} />
            <TourSections tour={tour} repoFullName={repoName} />
          </div>
        </div>
      </div>
    );
  } else {
    body = (
      <div style={s.band}>
        {progress}
        <TourEmpty notCloned={pageMode(data) === "not_cloned"} generating={generating} onGenerate={generate} />
      </div>
    );
  }

  return <AppShell crumb={crumb}>{body}</AppShell>;
}
