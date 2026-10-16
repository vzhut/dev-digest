/* /ci-runs — agent reviews that ran inside CI (not local runs). Opening the page and every 60 s the
   server pulls new runs from GitHub (useCiRuns); Refresh does the same on demand. Filtering is local. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, SelectInput, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { CiRunsTable } from "@/components/ci-runs-table";
import { apiErrorMessage } from "@/lib/api";
import { useCiRuns } from "@/lib/hooks/ci";
import { agentOptions, filterRuns, newestFirst, NO_FILTERS, repoOptions } from "./helpers";
import { s } from "./styles";

export function CiRunsView() {
  const t = useTranslations("ci");
  const q = useCiRuns();
  const [filters, setFilters] = React.useState(NO_FILTERS);

  const all = q.data?.runs ?? [];
  const visible = filterRuns(newestFirst(all), filters);
  const agents = [{ value: "", label: t("runs.filters.allAgents") }, ...agentOptions(all)];
  const repos = [{ value: "", label: t("runs.filters.allRepos") }, ...repoOptions(all)];

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("runs.title")}</h1>
            <p style={s.subtitle}>{t("runs.subtitle")}</p>
          </div>
          <span style={s.auto}>
            <span style={s.autoDot} aria-hidden="true" />
            {t("runs.autoRefresh")}
          </span>
          <Button kind="secondary" size="sm" icon="RefreshCw" loading={q.isFetching} onClick={() => void q.refetch()}>
            {q.isFetching ? t("runs.refreshing") : t("runs.refresh")}
          </Button>
        </div>

        {all.length > 0 && (
          <div style={s.filters}>
            <label style={s.filter}>
              <span style={s.filterLabel}>{t("runs.filters.agentLabel")}</span>
              <SelectInput
                mono={false}
                value={filters.agentId}
                options={agents}
                onChange={(agentId) => setFilters((f) => ({ ...f, agentId }))}
              />
            </label>
            <label style={s.filter}>
              <span style={s.filterLabel}>{t("runs.filters.repoLabel")}</span>
              <SelectInput
                mono={false}
                value={filters.repo}
                options={repos}
                onChange={(repo) => setFilters((f) => ({ ...f, repo }))}
              />
            </label>
          </div>
        )}

        {q.isError && !q.data ? (
          <ErrorState
            title={t("runs.loadError")}
            body={apiErrorMessage(q.error, t("runs.loadErrorBody"))}
            onRetry={() => void q.refetch()}
          />
        ) : !q.data ? (
          <div role="status" aria-label={t("runs.loading")}>
            <Skeleton height={160} />
          </div>
        ) : all.length === 0 ? (
          <EmptyState icon="Workflow" title={t("runs.emptyTitle")} body={t("runs.emptyBody")} />
        ) : visible.length === 0 ? (
          <div style={s.muted}>{t("runs.noMatch")}</div>
        ) : (
          <CiRunsTable runs={visible} />
        )}
      </div>
    </AppShell>
  );
}
