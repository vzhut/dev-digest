/* PR detail view — /repos/:repoId/pulls/:number. Header + Overview / Agent runs /
   Files changed tabs, live run tracking and the run-trace drawer.
   Tab and open trace live in the query (?tab=, ?trace=). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Skeleton, ErrorState } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { usePullDetail, usePulls } from "@/lib/hooks/core";
import {
  usePrReviews,
  useCancelRun,
  usePrActiveRuns,
  usePrRuns,
  useDeleteRun,
  useInvalidatePrRuns,
} from "@/lib/hooks/reviews";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { apiErrorMessage } from "@/lib/api";
import { githubPrUrl } from "@/lib/github-urls";
import { useSetSearchParam } from "@/lib/search-params";
import { PrDetailHeader } from "../PrDetailHeader";
import { OverviewTab } from "../OverviewTab";
import { FindingsTab } from "../FindingsTab";
import { DiffTab } from "../DiffTab";
import { RunTraceDrawer } from "../RunTraceDrawer";
import { diffDeepLinkQuery, latestReviewSummary, parseDiffTarget, scrollParentOf } from "./helpers";
import { s } from "./styles";

export function PrDetailView() {
  const t = useTranslations("prReview");
  const params = useParams<{ repoId: string; number: string }>();
  const search = useSearchParams();
  const setParam = useSetSearchParam();
  const pathname = usePathname();
  const router = useRouter();
  const { repoId, number } = params;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  // The route is keyed by PR number, but every PR API is keyed by the row's
  // uuid — resolve number → uuid via the (cached) pulls list before fetching.
  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const prId = pulls?.find((p) => p.number === Number(number))?.id ?? null;
  const { data: pr, isLoading: detailLoading, isError, error, refetch } = usePullDetail(prId);

  const isLoading = pullsLoading || (prId != null && detailLoading);
  const { data: reviews, refetch: refetchReviews } = usePrReviews(prId);

  // Live run tracking is SERVER-SOURCED (agent_runs status='running'): survives
  // navigation AND reload, and self-clears via polling when runs finish.
  const { data: activeRuns } = usePrActiveRuns(prId);
  const { data: prRuns } = usePrRuns(prId);
  const deleteRun = useDeleteRun(prId);
  const liveRunIds = (activeRuns ?? []).map((r) => r.run_id);
  const reviewRunning = liveRunIds.length > 0;
  const cancel = useCancelRun();
  // When a run settles (done OR failed) refresh the full run history too, so a
  // just-failed run shows up in "Run history" immediately — no page reload.
  const invalidateRuns = useInvalidatePrRuns(prId);

  const tab = search.get("tab") ?? "overview";
  const traceRunId = search.get("trace");
  // Leaving Overview (a tab click or a link into Files changed) must not lose the reader's place:
  // the shell's <main> keeps its scrollTop, so coming back landed at the end of the page.
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const overviewScroll = React.useRef<number | null>(null);
  const rememberOverviewScroll = () => {
    if (tab === "overview") overviewScroll.current = scrollParentOf(bodyRef.current)?.scrollTop ?? null;
  };
  React.useLayoutEffect(() => {
    if (tab !== "overview") return;
    const container = scrollParentOf(bodyRef.current);
    if (container) container.scrollTop = overviewScroll.current ?? 0;
    overviewScroll.current = null;
  }, [tab]);
  const setTab = (t: string) => {
    if (t !== tab) rememberOverviewScroll();
    setParam("tab", t);
  };
  const targetFile = search.get("file");
  const targetLine = search.get("line");
  const diffTarget = React.useMemo(() => parseDiffTarget(targetFile, targetLine), [targetFile, targetLine]);
  // One router.replace for tab + file + line — three setParam calls would each
  // start from the same stale query and keep only the last key.
  const openInDiff = (file: string, line: number) => {
    rememberOverviewScroll();
    router.replace(`${pathname}?${diffDeepLinkQuery(search.toString(), file, line)}`);
  };

  // Reviews come newest-first; each is its own run (grouped into accordions).
  const runs = reviews ?? [];
  const allFindings: FindingRecord[] = React.useMemo(
    () => runs.flatMap((r) => r.findings),
    [reviews],
  );
  const latestReview = React.useMemo(() => latestReviewSummary(runs), [reviews]);
  const prFiles = pr?.files;
  const diffPaths = React.useMemo(() => (prFiles ?? []).map((f) => f.path), [prFiles]);
  const lethalTrifecta = allFindings.filter((f) => f.kind === "lethal_trifecta");
  const findingsCount = allFindings.length;

  const repoName = activeRepo?.full_name ?? repoId;
  // The real "owner/repo" (null until the repo is loaded) — used to build
  // github.com deep-links for the header and finding file references.
  const repoFullName = activeRepo?.full_name ?? null;
  const crumb = [
    { label: repoName, mono: true, href: `/repos/${repoId}/pulls` },
    { label: t("list.breadcrumb"), href: `/repos/${repoId}/pulls` },
    { label: `#${number}`, mono: true },
  ];

  // Stale/unknown :repoId → friendly empty state instead of a 404 error.
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.loading}>
          <Skeleton height={28} width={420} />
          <Skeleton height={16} width={300} />
          <Skeleton height={200} />
        </div>
      </AppShell>
    );
  }

  if (isError || !pr) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("detail.loadErrorTitle")}
          body={apiErrorMessage(error, t("detail.loadErrorBody", { number }))}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <PrDetailHeader
        pr={pr}
        prId={prId}
        tab={tab}
        findingsCount={findingsCount}
        githubUrl={repoFullName ? githubPrUrl(repoFullName, pr.number) : null}
        onSetTab={setTab}
        onRunStart={() => setTab("findings")}
        onRunsStarted={() => invalidateRuns.activeRuns()}
      />

      <div ref={bodyRef} style={s.body}>
        {tab === "overview" && (
          <OverviewTab
            prId={prId}
            prBody={pr.body}
            repoId={repoId}
            repoFullName={repoFullName}
            baseRef={pr.base}
            diffPaths={diffPaths}
            filesCount={pr.files_count}
            latestReview={latestReview}
            onOpenInDiff={openInDiff}
          />
        )}

        {tab === "findings" && (
          <FindingsTab
            prId={prId}
            liveRunIds={liveRunIds}
            reviewRunning={reviewRunning}
            lethalTrifecta={lethalTrifecta}
            runs={runs}
            prRuns={prRuns}
            prCommits={pr.commits}
            repoFullName={repoFullName}
            headSha={pr.head_sha}
            cancelMutation={cancel}
            onOpenTrace={(id) => setParam("trace", id)}
            onDelete={(id) => {
              if (window.confirm(t("detail.confirmDeleteRun")))
                deleteRun.mutate(id);
            }}
            onRunDone={() => {
              invalidateRuns.activeRuns();
              invalidateRuns.history();
              refetchReviews();
            }}
          />
        )}

        {tab === "diff" && (
          <DiffTab
            prId={prId}
            filesCount={pr.files_count}
            files={pr.files}
            canComment={pr.status === "open"}
            target={diffTarget}
          />
        )}
      </div>

      {prId && traceRunId && (
        <RunTraceDrawer
          runId={traceRunId}
          prNumber={pr.number}
          findings={runs.find((r) => r.run_id === traceRunId)?.findings ?? []}
          agentName={runs.find((r) => r.run_id === traceRunId)?.agent_name ?? null}
          onClose={() => setParam("trace", null)}
        />
      )}
    </AppShell>
  );
}
