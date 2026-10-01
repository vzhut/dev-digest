"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { useSaveContextRoots } from "@/lib/hooks/context";
import { useToast } from "@/lib/toast";
import { parseRoots, rootsToText } from "../../helpers";
import { s } from "./styles";

/** Search-roots editor. The parent re-keys it when the saved roots change, so the draft stays local. */
export function RootsEditor({ repoId, roots }: { repoId: string; roots: string[] }) {
  const t = useTranslations("context.page.roots");
  const { toast } = useToast();
  const save = useSaveContextRoots(repoId);
  const [text, setText] = React.useState(() => rootsToText(roots));

  function submit(next: string[]) {
    save.mutate(next, { onSuccess: () => toast(t("saved"), "success") });
  }

  return (
    <section aria-label={t("title")} style={s.wrap}>
      <h2 style={s.title}>{t("title")}</h2>
      <p style={s.hint}>{t("hint")}</p>
      <textarea
        className="mono"
        aria-label={t("label")}
        placeholder={t("placeholder")}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={s.textarea}
      />
      <p style={s.hint}>{t("current", { roots: roots.join(", ") })}</p>
      {save.isError && (
        <p role="alert" style={s.error}>
          {t("error")}
        </p>
      )}
      <div style={s.actions}>
        <Button kind="primary" size="sm" loading={save.isPending} onClick={() => submit(parseRoots(text))}>
          {save.isPending ? t("saving") : t("save")}
        </Button>
        <Button
          kind="tertiary"
          size="sm"
          onClick={() => {
            setText("");
            submit([]);
          }}
        >
          {t("reset")}
        </Button>
      </div>
    </section>
  );
}
