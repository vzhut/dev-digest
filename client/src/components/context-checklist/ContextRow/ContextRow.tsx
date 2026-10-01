"use client";

import { useTranslations } from "next-intl";
import { IconBtn } from "@devdigest/ui";
import type { ChecklistRow } from "@/lib/context-docs";
import { s } from "../styles";

export interface ContextRowProps {
  row: ChecklistRow;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggle: () => void;
  onMove: (delta: -1 | 1) => void;
  onPreview: () => void;
}

/** One document row: checkbox, path, type tag, tokens, preview, reorder. Inherited rows are read-only. */
export function ContextRow({ row, canMoveUp, canMoveDown, onToggle, onMove, onPreview }: ContextRowProps) {
  const t = useTranslations("context.checklist");
  const inherited = row.inheritedFrom !== null;
  return (
    <li style={s.row(inherited || !row.attachable)}>
      {inherited ? (
        <span aria-hidden style={{ width: 16 }} />
      ) : (
        <input
          type="checkbox"
          checked={row.attached}
          disabled={!row.attachable}
          onChange={onToggle}
          aria-label={t("attachLabel", { path: row.path })}
          title={row.attachable ? undefined : t("notAttachable")}
        />
      )}
      <span className="mono" style={s.path} title={row.path}>
        {row.path}
      </span>
      {row.type && <span style={s.tag}>{t(`type.${row.type}`)}</span>}
      {row.missing && !inherited && (
        <span style={s.missing} title={t("missingHint")}>
          {t("missing")}
        </span>
      )}
      {inherited && <span style={s.meta}>{t("inheritedVia", { skill: row.inheritedFrom ?? "" })}</span>}
      {row.tokens !== null && <span style={s.meta}>{t("tokens", { tokens: row.tokens })}</span>}
      {!row.missing && (
        <button type="button" style={s.link} onClick={onPreview} aria-label={t("previewLabel", { path: row.path })}>
          {t("preview")}
        </button>
      )}
      {canMoveUp && <IconBtn icon="ArrowUp" label={t("moveUp", { path: row.path })} size={26} onClick={() => onMove(-1)} />}
      {canMoveDown && (
        <IconBtn icon="ArrowDown" label={t("moveDown", { path: row.path })} size={26} onClick={() => onMove(1)} />
      )}
    </li>
  );
}
