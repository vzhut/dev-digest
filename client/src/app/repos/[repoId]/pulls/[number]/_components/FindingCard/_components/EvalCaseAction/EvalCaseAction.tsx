/* EvalCaseAction — "Turn into eval case" on a decided finding (one click, no dialog), or the
   `must_find` / `must_not_flag` tag once the case exists. Disabled (with a visible reason that is
   also the button's description) while the finding is undecided or has no producing agent. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { apiErrorMessage } from "@/lib/api";
import { useCreateEvalCase, useEvalCaseLinks } from "@/lib/hooks/eval";
import { usePrReviews } from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import { s } from "./styles";

export function EvalCaseAction({ finding, prId }: { finding: FindingRecord; prId: string }) {
  const t = useTranslations("prReview.finding.evalCase");
  const links = useEvalCaseLinks(prId);
  const reviews = usePrReviews(prId);
  const create = useCreateEvalCase(prId);
  const reasonId = `eval-case-reason-${finding.id}`;

  const link = links.data?.find((l) => l.finding_id === finding.id);
  if (link) {
    return (
      <span style={s.tagWrap}>
        <Badge mono>{link.type}</Badge>
      </span>
    );
  }

  const decided = !!finding.accepted_at || !!finding.dismissed_at;
  const reviewsLoaded = reviews.data !== undefined;
  const agentId = reviews.data?.find((r) => r.id === finding.review_id)?.agent_id ?? null;
  const reason = !decided ? t("needsDecision") : reviewsLoaded && !agentId ? t("noAgent") : null;
  const disabled = !!reason || !reviewsLoaded || create.isPending;

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    create.mutate(finding.id, {
      onSuccess: (res) => notify.success(res.created ? t("created") : t("exists")),
      onError: (err) => notify.error(apiErrorMessage(err, t("failed"))),
    });
  };

  return (
    <span style={s.wrap}>
      <Button
        kind="ghost"
        size="sm"
        icon="FlaskConical"
        disabled={disabled}
        loading={create.isPending}
        aria-describedby={reason ? reasonId : undefined}
        data-eval-case-action
        onClick={onClick}
      >
        {t("turn")}
      </Button>
      {reason && (
        <span id={reasonId} style={s.reason}>
          {reason}
        </span>
      )}
    </span>
  );
}
