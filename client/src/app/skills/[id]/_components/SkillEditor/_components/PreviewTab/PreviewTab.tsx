"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";

/** Preview tab — the skill body rendered as Markdown (react-markdown, no raw HTML). */
export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t("previewTab.title")}</h2>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 20px" }}>{t("previewTab.subtitle")}</p>
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "var(--bg-surface)",
          padding: "24px 28px",
          fontSize: 14,
        }}
      >
        {skill.body.trim() ? <Markdown>{skill.body}</Markdown> : <p>{t("previewTab.empty")}</p>}
      </div>
    </div>
  );
}
