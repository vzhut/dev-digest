/* Multi-Agent Review view — /repos/:repoId/multi-agent.
   `?run=<id>`      → that run's results.
   no params        → the repo's LAST multi-agent run (so the page can always be reopened from the
                      sidebar); the Configure run form only when the repo has none yet.
   `?configure=1`   → the Configure run form (the header button and the PR-page picker link here). */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useLatestMultiAgentRun } from "@/lib/hooks/reviews";
import { ConfigureRun } from "../ConfigureRun";
import type { Mode } from "../../constants";
import { ModeSwitch } from "./_components/ModeSwitch";
import { MultiAgentResults } from "../MultiAgentResults";
import { s } from "./styles";

export function MultiAgentView() {
  const t = useTranslations("multiAgent");
  const router = useRouter();
  const { repoId } = useParams<{ repoId: string }>();
  const params = useSearchParams();
  const runParam = params.get("run");
  const configuring = params.get("configure") === "1";
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const latest = useLatestMultiAgentRun(repoId);
  const base = `/repos/${repoId}/multi-agent`;
  const [mode, setMode] = React.useState<Mode>("columns");

  const repoName = activeRepo?.full_name ?? repoId;
  const crumb = [
    { label: repoName, mono: true },
    { label: t("page.crumb") },
    ...(configuring ? [{ label: t("page.configureRun") }] : []),
  ];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  // Which run (if any) the results area shows.
  const waitingForLatest = !runParam && !configuring && latest.isLoading;
  const runId = configuring ? null : (runParam ?? latest.data?.id ?? null);
  const showResults = !!runId;

  return (
    <AppShell crumb={crumb}>
      <div style={s.pageHeader}>
        <h1 style={s.pageTitle}>{t("page.title")}</h1>
        <span style={s.pageSubtitle}>{t("page.subtitle")}</span>
        <div style={s.headerActions}>
          {showResults ? (
            <Button kind="secondary" size="sm" icon="Settings" onClick={() => router.push(`${base}?configure=1`)}>
              {t("page.configureRun")}
            </Button>
          ) : configuring && (runParam || latest.data?.id) ? (
            <Button kind="ghost" size="sm" onClick={() => router.push(runParam ? `${base}?run=${runParam}` : base)}>
              {t("page.backToResults")}
            </Button>
          ) : null}
          {showResults && <ModeSwitch mode={mode} onChange={setMode} />}
        </div>
      </div>
      {waitingForLatest ? (
        <div style={s.loading}>{t("page.loading")}</div>
      ) : showResults ? (
        <MultiAgentResults runId={runId} mode={mode} />
      ) : (
        <ConfigureRun repoId={repoId} />
      )}
    </AppShell>
  );
}
