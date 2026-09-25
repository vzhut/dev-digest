"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, useSmartDiff, usePrReviews } from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { FindingRecord, PrFile } from "@devdigest/shared";
import { COLLAPSED_ROLES, ROLE_LABEL_KEY } from "./constants";
import { filesWithFindings, findingsByFile, groupFiles, hasReview, latestReviewFindings } from "./helpers";
import { SmartDiffGroup } from "./_components/SmartDiffGroup";
import { InlineFinding } from "./_components/InlineFinding";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

export function DiffTab({ prId, filesCount, files, canComment }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);
  const [order, setOrder] = React.useState<"smart" | "original">("smart");
  // Loading / error → fall back to the original order.
  const { data: smart } = useSmartDiff(prId);
  const groups = order === "smart" && smart ? groupFiles(smart, files) : null;

  const { data: reviews } = usePrReviews(prId);
  const findings = React.useMemo(() => latestReviewFindings(reviews ?? []), [reviews]);
  const byFile = React.useMemo(() => findingsByFile(findings), [findings]);
  // Stable component identity so open/closed card state survives re-renders.
  const FindingView = React.useMemo(
    () =>
      function FindingView({ finding }: { finding: FindingRecord }) {
        return <InlineFinding finding={finding} prId={prId} />;
      },
    [prId],
  );
  const findingApi: DiffFindingApi = { byFile, show: showComments, FindingView };

  const commentCount = comments?.length ?? 0;
  const toggleCount = commentCount + findings.length;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <>
            {(["smart", "original"] as const).map((o) => (
              <Button
                key={o}
                kind={order === o ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={order === o}
                onClick={() => setOrder(o)}
              >
                {t(o === "smart" ? "smartDiff.smartOrder" : "smartDiff.originalOrder")}
              </Button>
            ))}
            {toggleCount > 0 ? (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                aria-pressed={showComments}
                onClick={() => setShowComments((v) => !v)}
              >
                {t("smartDiff.toggleFindings", { count: toggleCount })}
              </Button>
            ) : null}
          </>
        }
      >
        {t("smartDiff.filesChanged", { count: filesCount })}
      </SectionLabel>
      {reviews && !hasReview(reviews) ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 10px" }}>{t("smartDiff.noReviewYet")}</p>
      ) : null}
      {groups ? (
        groups.map((g) => (
          <SmartDiffGroup
            key={g.role}
            label={t(ROLE_LABEL_KEY[g.role])}
            fileCount={g.files.length}
            defaultCollapsed={COLLAPSED_ROLES.includes(g.role)}
            findingFilesCount={filesWithFindings(g.files, byFile)}
          >
            <DiffViewer files={g.files} commenting={commenting} findings={findingApi} />
          </SmartDiffGroup>
        ))
      ) : (
        <DiffViewer files={files} commenting={commenting} findings={findingApi} />
      )}
    </section>
  );
}
