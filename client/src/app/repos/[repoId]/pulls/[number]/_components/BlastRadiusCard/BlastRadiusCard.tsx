/* BlastRadiusCard — read-only map of the PR's changed symbols to their
   downstream callers, endpoints and cron/jobs, read from the repo-intel
   index (no re-parse, no LLM). Sits on the Overview tab, below IntentCard. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { useBlastRadius } from "@/lib/hooks/blast";
import { apiErrorMessage } from "@/lib/api";
import { BlastSummary } from "./_components/BlastSummary";
import { SymbolList } from "./_components/SymbolList";
import { IndexNotice } from "./_components/IndexNotice";
import { BlastGraph } from "./_components/BlastGraph";
import { incompleteNotice, refFor, statsOf } from "./helpers";
import { s } from "./styles";

type BlastView = "tree" | "graph";

export function BlastRadiusCard({
  prId,
  repoId,
  repoFullName,
  baseRef,
}: {
  prId: string | null;
  repoId: string;
  repoFullName: string | null;
  baseRef: string;
}) {
  const t = useTranslations("blast");
  const { data: blast, isLoading, isError, error, refetch } = useBlastRadius(prId);
  const [view, setView] = React.useState<BlastView>("tree");

  if (isLoading) {
    return (
      <section aria-label={t("loading")} aria-busy="true" style={{ ...s.card, ...s.skeleton }}>
        <Skeleton height={16} width={220} />
        <Skeleton height={60} />
      </section>
    );
  }

  if (isError) {
    return (
      <section aria-label={t("title")} style={s.card}>
        <ErrorState
          title={t("title")}
          body={apiErrorMessage(error, t("error"))}
          onRetry={() => refetch()}
        />
      </section>
    );
  }

  if (!blast) return null;

  const stats = statsOf(blast);
  const indexRef = refFor(blast, baseRef);
  const notice = incompleteNotice(blast);

  return (
    <section aria-label={t("title")} style={s.card}>
      <div style={s.header}>
        <span style={s.title}>{t("title")}</span>
        <div role="group" style={s.viewSwitch}>
          <button
            type="button"
            style={{ ...s.viewButton, ...(view === "tree" ? s.viewButtonActive : {}) }}
            aria-pressed={view === "tree"}
            onClick={() => setView("tree")}
          >
            {t("view.tree")}
          </button>
          <button
            type="button"
            style={{ ...s.viewButton, ...(view === "graph" ? s.viewButtonActive : {}) }}
            aria-pressed={view === "graph"}
            onClick={() => setView("graph")}
          >
            {t("view.graph")}
          </button>
        </div>
      </div>

      {notice.show && notice.reasonKey && (
        <IndexNotice
          reasonKey={notice.reasonKey}
          indexStatus={blast.index_status ?? null}
          repoId={repoId}
          onResynced={() => refetch()}
        />
      )}

      <p style={s.summary}>{blast.summary}</p>
      <BlastSummary stats={stats} />

      {view === "graph" ? (
        <BlastGraph downstream={blast.downstream} />
      ) : blast.downstream.length > 0 ? (
        <SymbolList downstream={blast.downstream} repoFullName={repoFullName} indexRef={indexRef} />
      ) : (
        <p style={s.empty}>
          {stats.symbols_changed > 0 ? t("noDownstream", { count: stats.symbols_changed }) : t("noSymbols")}
        </p>
      )}

      {blast.unattributed_endpoints && blast.unattributed_endpoints.length > 0 && (
        <div>
          <span style={s.label}>{t("unattributed")}</span>
          <ul style={s.list}>
            {blast.unattributed_endpoints.map((endpoint) => (
              <li key={endpoint} className="mono">
                {endpoint}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
