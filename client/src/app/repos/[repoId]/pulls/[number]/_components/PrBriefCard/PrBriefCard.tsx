/* PrBriefCard — the "why + risk" brief at the top of the PR Overview tab.
   Reading never generates; the user starts one LLM call with Generate / refresh.
   The Intent and Blast cards arrive as slots and sit in the grid in every state. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import type { Verdict } from "@devdigest/shared";
import { usePrBrief, useGeneratePrBrief } from "@/lib/hooks/brief";
import { apiErrorMessage } from "@/lib/api";
import { VerdictBanner } from "../VerdictBanner";
import { BriefHeader } from "./_components/BriefHeader";
import { BriefEmpty } from "./_components/BriefEmpty";
import { GenerationError, MissingInputs, StaleNotice } from "./_components/BriefNotices";
import { RiskAreas } from "./_components/RiskAreas";
import { ReviewFocus } from "./_components/ReviewFocus";
import { s } from "./styles";

/** The latest finished review run, for the verdict banner at the top of the brief. */
export interface PrBriefLatestReview {
  verdict: Verdict;
  score: number | null;
  findingsCount: number;
  blockers: number;
  agentName?: string | null;
}

export interface PrBriefCardProps {
  prId: string | null;
  /** Paths of the PR's changed files; a reference outside this set is not navigable. */
  diffPaths: string[];
  filesCount: number;
  latestReview: PrBriefLatestReview | null;
  /** The existing Intent / Blast radius cards, placed in the brief grid. Intent receives the risk areas to host. */
  intent: (risks: React.ReactNode) => React.ReactNode;
  blast: React.ReactNode;
  onOpenInDiff: (file: string, line: number) => void;
}

export function PrBriefCard({
  prId,
  diffPaths,
  filesCount,
  latestReview,
  intent,
  blast,
  onOpenInDiff,
}: PrBriefCardProps) {
  const t = useTranslations("brief");
  const query = usePrBrief(prId);
  const generate = useGeneratePrBrief(prId);
  const pathSet = React.useMemo(() => new Set(diffPaths), [diffPaths]);

  // Loading and load-error keep the Intent / Blast slots in the grid (AC-22); only the brief area changes.
  if (query.isLoading) {
    return (
      <section aria-label={t("card.title")} aria-busy="true" style={s.card}>
        <Skeleton height={16} width={220} />
        <Skeleton height={60} />
        <div style={s.grid}>
          <div style={s.column}>{intent(null)}</div>
          <div style={s.column}>{blast}</div>
        </div>
      </section>
    );
  }

  if (query.isError) {
    return (
      <section aria-label={t("card.title")} style={s.card}>
        <ErrorState
          title={t("card.loadErrorTitle")}
          body={apiErrorMessage(query.error, t("card.loadErrorBody"))}
          onRetry={() => query.refetch()}
        />
        <div style={s.grid}>
          <div style={s.column}>{intent(null)}</div>
          <div style={s.column}>{blast}</div>
        </div>
      </section>
    );
  }

  const data = query.data;
  const brief = data?.brief ?? null;
  const busy = generate.isPending || data?.status === "generating";
  const run = () => generate.mutate();
  const failed = generate.isError && !busy;
  const hasBrief = !!brief && !busy;
  // The one Risk areas block; it is hosted inside the Intent card, not in this column.
  const risks = busy ? (
    <Skeleton height={80} />
  ) : brief ? (
    <RiskAreas risks={brief.risks.risks} diffPaths={pathSet} onOpenInDiff={onOpenInDiff} />
  ) : null;

  return (
    <section aria-label={t("card.title")} style={s.card}>
      <BriefHeader
        usage={hasBrief ? brief.usage : null}
        model={brief?.model}
        canRefresh={!!brief}
        busy={busy}
        onRefresh={run}
      />

      {failed && (
        <GenerationError error={generate.error} previous={brief} onRetry={run} retrying={busy} />
      )}

      {busy ? (
        <div role="status" aria-label={t("generating.label")} style={s.stack}>
          <Skeleton height={14} />
          <Skeleton height={14} width="80%" />
          <Skeleton height={60} />
        </div>
      ) : brief ? (
        <>
          {data?.stale && <StaleNotice onRefresh={run} busy={busy} />}
          {latestReview ? (
            <VerdictBanner
              verdict={latestReview.verdict}
              summary={brief.summary}
              score={latestReview.score}
              findingsCount={latestReview.findingsCount}
              blockers={latestReview.blockers}
              agentName={latestReview.agentName}
            />
          ) : (
            <p style={s.summary}>{brief.summary}</p>
          )}
          <MissingInputs missing={brief.inputs?.missing ?? []} />
        </>
      ) : (
        !failed && <BriefEmpty noChanges={filesCount === 0} onGenerate={run} />
      )}

      <div style={s.grid}>
        <div style={s.column}>
          {intent(risks)}
        </div>
        <div style={s.column}>{blast}</div>
      </div>

      {!busy && brief && (
        <ReviewFocus items={brief.review_focus} diffPaths={pathSet} onOpenInDiff={onOpenInDiff} />
      )}
    </section>
  );
}
