"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { s } from "./styles";

/** Approximate token count (chars / 4). */
const estimateTokens = (text: string) => Math.ceil(text.length / 4);

/** Code-editor style card: file bar, line-number gutter, monospace textarea. */
export function SkillBodyEditor({
  name,
  value,
  unsaved,
  onChange,
}: {
  name: string;
  value: string;
  unsaved: boolean;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("skills");
  const gutterRef = React.useRef<HTMLDivElement>(null);
  const lineCount = value.split("\n").length;
  const numbers = Array.from({ length: lineCount }, (_, i) => i + 1).join("\n");

  return (
    <div style={s.card}>
      <div style={s.bar}>
        <Icon.FileText size={14} />
        <span className="mono" style={s.fileName}>
          {name || "skill"}.md
        </span>
        {unsaved && <Badge>{t("config.unsaved")}</Badge>}
        <span className="mono" style={s.tokens}>
          {t("config.tokens", { count: estimateTokens(value) })}
        </span>
      </div>
      <div style={s.area}>
        <div ref={gutterRef} className="mono" style={s.gutter} aria-hidden="true">
          {numbers}
        </div>
        <textarea
          className="mono"
          aria-label={t("config.body")}
          style={s.textarea}
          value={value}
          spellCheck={false}
          wrap="off"
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
        />
      </div>
    </div>
  );
}
