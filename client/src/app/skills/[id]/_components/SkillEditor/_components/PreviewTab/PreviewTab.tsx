"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";

/** Preview tab — the skill body rendered as Markdown (react-markdown, no raw HTML). */
export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={{ maxWidth: 760, fontSize: 14 }}>
      {skill.body.trim() ? <Markdown>{skill.body}</Markdown> : <p>{t("previewTab.empty")}</p>}
    </div>
  );
}
