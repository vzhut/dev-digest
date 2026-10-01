"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import { apiErrorMessage } from "@/lib/api";
import { useContextDoc, useWriteContextFile } from "@/lib/hooks/context";
import { useToast } from "@/lib/toast";
import { MAX_DOC_BYTES } from "../../constants";
import { byteLength } from "../../helpers";
import { s } from "./styles";

export interface DocEditorProps {
  repoId: string;
  path: string;
  /** Reports whether the draft differs from the saved text, so the parent can guard navigation. */
  onDirtyChange: (dirty: boolean) => void;
  /** Cancel pressed (the parent decides whether to confirm discarding a dirty draft). */
  onCancel: () => void;
  /** Save succeeded; the parent returns to the preview. */
  onSaved: () => void;
}

/** Plain-text editor for one doc. Writes to the repo's local clone only (the notice says so). */
export function DocEditor({ repoId, path, onDirtyChange, onCancel, onSaved }: DocEditorProps) {
  const t = useTranslations("context.page.edit");
  const { toast } = useToast();
  const doc = useContextDoc(repoId, path);
  const write = useWriteContextFile(repoId);
  // null = untouched; the textarea follows the fetched text.
  const [draft, setDraft] = React.useState<string | null>(null);
  const onDirtyRef = React.useRef(onDirtyChange);
  onDirtyRef.current = onDirtyChange;
  React.useEffect(() => () => onDirtyRef.current(false), []);

  if (doc.isError) return <ErrorState title={t("saveError")} onRetry={() => doc.refetch()} />;
  if (doc.isLoading || !doc.data) return <Skeleton height={200} />;

  const original = doc.data.content;
  const value = draft ?? original;
  const dirty = value !== original;
  const tooLarge = byteLength(value) > MAX_DOC_BYTES;

  function change(next: string) {
    setDraft(next);
    onDirtyChange(next !== original);
  }

  function save() {
    write.mutate(
      { path, content: value },
      {
        onSuccess: () => {
          toast(t("saved"), "success");
          onSaved();
        },
      },
    );
  }

  const errorText = tooLarge ? t("tooLarge") : write.isError ? apiErrorMessage(write.error, t("saveError")) : null;

  return (
    <div style={s.wrap}>
      <p role="note" style={s.notice}>
        {t("notice")}
      </p>
      <textarea
        className="mono"
        aria-label={t("label")}
        value={value}
        onChange={(e) => change(e.target.value)}
        spellCheck={false}
        style={s.textarea}
      />
      {errorText && (
        <p role="alert" style={s.error}>
          {errorText}
        </p>
      )}
      <div style={s.actions}>
        <Button kind="primary" onClick={save} disabled={!dirty || tooLarge || write.isPending} loading={write.isPending}>
          {write.isPending ? t("saving") : t("save")}
        </Button>
        <Button kind="tertiary" onClick={onCancel} disabled={write.isPending}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
