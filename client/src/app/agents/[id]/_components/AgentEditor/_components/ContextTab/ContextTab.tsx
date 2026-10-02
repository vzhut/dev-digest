"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent, AgentContext, ContextListing } from "@devdigest/shared";
import { ContextChecklist } from "@/components/context-checklist";
import { DocPreview } from "@/components/doc-preview";
import { buildChecklistRows, toPaths } from "@/lib/context-docs";
import { useContextDocs, useAgentContext, useSaveAgentContext } from "@/lib/hooks/context";
import { useActiveRepo } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

/** Context tab — attach, order and preview project docs for one agent (explicit save, no version bump). */
export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { repoId } = useActiveRepo();
  const docs = useContextDocs(repoId);
  const ctx = useAgentContext(agent.id);

  if (!repoId) {
    return (
      <div style={s.wrap}>
        <EmptyState icon="FileText" title={t("context.noRepo.title")} body={t("context.noRepo.body")} />
      </div>
    );
  }
  if (docs.isError || ctx.isError) {
    return (
      <div style={s.wrap}>
        <ErrorState
          title={t("context.loadError")}
          onRetry={() => {
            void docs.refetch();
            void ctx.refetch();
          }}
        />
      </div>
    );
  }
  if (!docs.data || !ctx.data) {
    return (
      <div style={s.wrap}>
        <Skeleton height={120} />
      </div>
    );
  }
  return <ContextEditor agent={agent} repoId={repoId} listing={docs.data} context={ctx.data} />;
}

function ContextEditor({
  agent,
  repoId,
  listing,
  context,
}: {
  agent: Agent;
  repoId: string;
  listing: ContextListing;
  context: AgentContext;
}) {
  const t = useTranslations("agents");
  const toast = useToast();
  const save = useSaveAgentContext(agent.id);
  // null = no local edit yet; the checklist follows the saved paths (and refetched listing).
  const [draft, setDraft] = React.useState<string[] | null>(null);
  const rows = buildChecklistRows(listing.files, draft ?? context.paths, context.inherited);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  const onSave = () =>
    save.mutate(toPaths(rows), {
      onSuccess: () => {
        setDraft(null);
        toast.success(t("context.savedToast"));
      },
    });

  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("context.title")}</h2>
      <p style={s.hint}>{t("context.hint")}</p>
      <ContextChecklist rows={rows} onChange={(next) => setDraft(toPaths(next))} onPreview={setPreviewPath} roots={listing.roots} />
      {previewPath && (
        <div style={s.preview}>
          <DocPreview repoId={repoId} path={previewPath} />
        </div>
      )}
      <div style={s.actions}>
        <Button kind="primary" onClick={onSave} loading={save.isPending}>
          {save.isPending ? t("context.saving") : t("context.save")}
        </Button>
      </div>
    </div>
  );
}
