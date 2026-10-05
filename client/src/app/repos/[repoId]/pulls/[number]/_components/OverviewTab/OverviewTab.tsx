"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { PriorPrsCard } from "../PriorPrsCard";
import { PrBriefCard, type PrBriefLatestReview } from "../PrBriefCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
  repoId: string;
  repoFullName: string | null;
  baseRef: string;
  diffPaths: string[];
  filesCount: number;
  latestReview: PrBriefLatestReview | null;
  onOpenInDiff: (file: string, line: number) => void;
}

export function OverviewTab({
  prId,
  prBody,
  repoId,
  repoFullName,
  baseRef,
  diffPaths,
  filesCount,
  latestReview,
  onOpenInDiff,
}: OverviewTabProps) {
  const t = useTranslations("prReview");
  return (
    <>
      <PrBriefCard
        prId={prId}
        diffPaths={diffPaths}
        filesCount={filesCount}
        latestReview={latestReview}
        intent={(risks) => <IntentCard prId={prId} risks={risks} />}
        blast={<BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} baseRef={baseRef} />}
        onOpenInDiff={onOpenInDiff}
      />
      <PriorPrsCard prId={prId} repoFullName={repoFullName} />
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">{t("detail.description")}</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
