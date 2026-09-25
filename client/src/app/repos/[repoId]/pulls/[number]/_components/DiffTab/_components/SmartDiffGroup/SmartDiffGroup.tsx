"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { chevronFor } from "@/components/diff-viewer";
import { s } from "./styles";

interface SmartDiffGroupProps {
  label: string;
  fileCount: number;
  defaultCollapsed?: boolean;
  /** Files in the group that carry findings; the dot + count show when > 0. */
  findingFilesCount?: number;
  children: React.ReactNode;
}

/** One role group: sticky collapsible header ("Core · 3 files") over a body. */
export function SmartDiffGroup({
  label,
  fileCount,
  defaultCollapsed = false,
  findingFilesCount = 0,
  children,
}: SmartDiffGroupProps) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(!defaultCollapsed);

  return (
    <div style={s.wrap}>
      <button type="button" style={s.header} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <span>{label}</span>
        <span style={s.count}>{t("smartDiff.filesCount", { count: fileCount })}</span>
        {findingFilesCount > 0 ? (
          <span style={s.findings} title={t("smartDiff.filesWithFindings", { count: findingFilesCount })}>
            <span style={s.dot} aria-hidden />
            {findingFilesCount}
          </span>
        ) : null}
      </button>
      {open ? <div style={s.body}>{children}</div> : null}
    </div>
  );
}
