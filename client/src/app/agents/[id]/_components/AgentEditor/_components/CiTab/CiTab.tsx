/* CiTab — the agent's CI deployment: the repos it is exported to (status, versions, last run), the
   "Fail CI on" policy, the Export to CI wizard (Add to CI) and the history of its CI runs. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, SelectInput, Skeleton } from "@devdigest/ui";
import type { Agent, CiFailOn } from "@devdigest/shared";
import { CiRunsTable } from "@/components/ci-runs-table";
import { apiErrorMessage } from "@/lib/api";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { useCiInstallations, useCiRuns } from "@/lib/hooks/ci";
import { CI_FAIL_ON_VALUES } from "../../constants";
import { ExportWizard } from "./_components/ExportWizard";
import { InstallationRow } from "./_components/InstallationRow";
import { activeCount, isOutdated, lastRunIn, runsOfAgent } from "./helpers";
import { s } from "./styles";

export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci.ciTab");
  const ta = useTranslations("agents");
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const installations = useCiInstallations(agent.id);
  const runs = useCiRuns();
  const update = useUpdateAgent();

  const agentRuns = runsOfAgent(runs.data?.runs ?? [], agent.id);
  const rows = installations.data ?? [];
  const anyOutdated = rows.some((i) => isOutdated(i, agent.version));
  const ciFailOnOptions = CI_FAIL_ON_VALUES.map((v) => ({ value: v, label: ta(`config.ciFailOnOptions.${v}`) }));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.headerText}>
          <h2 style={s.h2}>{t("heading")}</h2>
          <p style={s.subtitle}>{t("subtitle")}</p>
        </div>
        {installations.data && <span style={s.activeNote}>{t("activeIn", { count: activeCount(rows) })}</span>}
        <Button kind="primary" icon="Plus" onClick={() => setWizardOpen(true)}>
          {t("addToCi")}
        </Button>
      </div>

      {anyOutdated && (
        <div role="note" style={s.notice}>
          {t("outdatedNotice")}
        </div>
      )}

      {installations.isError ? (
        <ErrorState
          title={t("loadError")}
          body={apiErrorMessage(installations.error, t("loadErrorBody"))}
          onRetry={() => void installations.refetch()}
        />
      ) : !installations.data ? (
        <div role="status" aria-label={t("loading")}>
          <Skeleton height={64} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon="Workflow" title={t("emptyTitle")} body={t("empty")} cta={t("addToCi")} onCta={() => setWizardOpen(true)} />
      ) : (
        <ul style={s.list} aria-label={t("installationsLabel")}>
          {rows.map((i) => (
            <InstallationRow
              key={i.id}
              installation={i}
              outdated={isOutdated(i, agent.version)}
              lastRun={lastRunIn(agentRuns, i.repo)}
            />
          ))}
        </ul>
      )}

      <label style={s.failOn}>
        <div style={s.sectionTitle}>{ta("config.ciFailOn")}</div>
        <SelectInput
          value={agent.ci_fail_on}
          onChange={(v) => update.mutate({ id: agent.id, patch: { ci_fail_on: v as CiFailOn } })}
          options={ciFailOnOptions}
          mono={false}
        />
        <div style={s.muted}>{ta("config.ciFailOnHint")}</div>
      </label>

      <section aria-label={t("historyTitle")}>
        <h3 style={s.sectionTitle}>{t("historyTitle")}</h3>
        {runs.isError ? (
          <ErrorState title={t("historyError")} onRetry={() => void runs.refetch()} />
        ) : !runs.data ? (
          <Skeleton height={64} />
        ) : agentRuns.length === 0 ? (
          <div style={s.muted}>{t("historyEmpty")}</div>
        ) : (
          <CiRunsTable runs={agentRuns} />
        )}
      </section>

      {wizardOpen && <ExportWizard agent={agent} onClose={() => setWizardOpen(false)} />}
    </div>
  );
}
