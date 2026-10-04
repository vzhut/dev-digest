"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "../../styles";

/** No brief stored yet: explains the block, notes the LLM cost, and never generates by itself. */
export function BriefEmpty({
  noChanges,
  onGenerate,
}: {
  noChanges: boolean;
  onGenerate: () => void;
}) {
  const t = useTranslations("brief");
  return (
    <div style={s.empty}>
      <strong>{t("empty.title")}</strong>
      <p style={s.muted}>{t("empty.body")}</p>
      <p style={s.muted}>{noChanges ? t("empty.noChanges") : t("empty.llmNote")}</p>
      <Button kind="primary" icon="Sparkles" disabled={noChanges} onClick={onGenerate}>
        {t("empty.generate")}
      </Button>
    </div>
  );
}
