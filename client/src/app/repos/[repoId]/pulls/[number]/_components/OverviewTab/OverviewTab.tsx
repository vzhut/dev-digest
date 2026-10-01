"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { PriorPrsCard } from "../PriorPrsCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
  repoId: string;
  repoFullName: string | null;
  baseRef: string;
}

export function OverviewTab({ prId, prBody, repoId, repoFullName, baseRef }: OverviewTabProps) {
  const t = useTranslations("prReview");
  return (
    <>
      <IntentCard prId={prId} />
      <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} baseRef={baseRef} />
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
