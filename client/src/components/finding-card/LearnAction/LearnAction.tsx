/* LearnAction — "Learn" on a finding: saves it as a repo learning (one click, no dialog).
   Pending while saving; once `learned_at` is set it stays disabled and pressed. A failure
   shows inline text and leaves the button enabled so the user can retry. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { apiErrorMessage } from "@/lib/api";
import { useLearnFinding } from "@/lib/hooks/reviews";
import { s } from "./styles";

export function LearnAction({
  finding,
  prId,
  multiAgentRunId,
}: {
  finding: FindingRecord;
  prId: string;
  multiAgentRunId?: string;
}) {
  const t = useTranslations("prReview.finding");
  const learn = useLearnFinding();
  const learned = !!finding.learned_at;

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    learn.mutate({ findingId: finding.id, prId, multiAgentRunId });
  };

  return (
    <span style={s.wrap}>
      <Button
        kind="ghost"
        size="sm"
        icon="Lightbulb"
        active={learned}
        aria-pressed={learned}
        disabled={learned || learn.isPending}
        loading={learn.isPending}
        onClick={onClick}
      >
        {t("learn")}
      </Button>
      {learn.isError && (
        <span role="alert" style={s.error}>
          {apiErrorMessage(learn.error, t("learnFailed"))}
        </span>
      )}
    </span>
  );
}
