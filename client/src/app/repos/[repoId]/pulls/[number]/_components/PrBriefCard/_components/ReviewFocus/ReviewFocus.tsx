"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { ReviewFocusItem } from "@devdigest/shared";
import { FileRefButton } from "../FileRefButton";
import { s } from "../../styles";

export function ReviewFocus({
  items,
  diffPaths,
  onOpenInDiff,
}: {
  items: ReviewFocusItem[];
  diffPaths: ReadonlySet<string>;
  onOpenInDiff: (file: string, line: number) => void;
}) {
  const t = useTranslations("brief");
  return (
    <section style={s.focusCard} aria-label={t("focus.title")}>
      <div style={s.sectionHead}>
        <Icon.ListChecks size={14} style={s.headIcon} />
        <span style={s.title}>{t("focus.title")}</span>
        <Badge>{t("focus.count", { count: items.length })}</Badge>
      </div>
      {items.length === 0 ? (
        <p style={s.muted}>{t("focus.empty")}</p>
      ) : (
        <ul style={s.focusList}>
          {items.map((item, i) => (
            <li key={`${item.file}:${item.line}:${i}`} style={s.focusItem}>
              <Icon.ChevronRight size={10} style={s.focusBullet} aria-hidden="true" />
              <span style={s.focusText}>
                <FileRefButton fileRef={`${item.file}:${item.line}`} diffPaths={diffPaths} onOpenInDiff={onOpenInDiff} />
                <span style={s.focusReason}>— {item.reason}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
