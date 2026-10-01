"use client";

import { useTranslations } from "next-intl";
import { Markdown, Skeleton, ErrorState } from "@devdigest/ui";
import { useContextDoc } from "@/lib/hooks/context";
import { s } from "./styles";

/** Read-only rendered preview of one repo document. Markdown only — raw HTML is never rendered. */
export function DocPreview({
  repoId,
  path,
  hideTitle,
}: {
  repoId: string | null | undefined;
  path: string;
  /** Skip the path heading when the caller already shows the path (default: shown). */
  hideTitle?: boolean;
}) {
  const t = useTranslations("context.preview");
  const doc = useContextDoc(repoId, path);

  return (
    <section style={s.wrap} aria-label={t("title", { path })}>
      {!hideTitle && (
        <h3 className="mono" style={s.title}>
          {path}
        </h3>
      )}
      {doc.isError ? (
        <ErrorState title={t("loadError")} onRetry={() => doc.refetch()} />
      ) : doc.isLoading || !doc.data ? (
        <div role="status" aria-label={t("loading")}>
          <Skeleton height={120} />
        </div>
      ) : doc.data.content.trim() === "" ? (
        <p style={s.note}>{t("empty")}</p>
      ) : (
        <div style={s.body}>
          <Markdown>{doc.data.content}</Markdown>
        </div>
      )}
    </section>
  );
}
