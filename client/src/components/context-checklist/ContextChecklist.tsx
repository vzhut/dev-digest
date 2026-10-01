"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton, ErrorState, EmptyState, TextInput } from "@devdigest/ui";
import { attachedCount, filterRows, selectionTokens, type ChecklistRow } from "@/lib/context-docs";
import { canMove, moveAttached, toggleRow } from "./helpers";
import { ContextRow } from "./ContextRow";
import { s } from "./styles";

export interface ContextChecklistProps {
  rows: ChecklistRow[];
  /** Parent owns the draft and the save; every tick/reorder reports the next rows. */
  onChange: (rows: ChecklistRow[]) => void;
  onPreview: (path: string) => void;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  /** Search roots, named in the empty state. */
  roots: string[];
}

/** Checklist of project docs to attach to an agent/skill, with filter, live token estimate and reorder. */
export function ContextChecklist({ rows, onChange, onPreview, isLoading, isError, onRetry, roots }: ContextChecklistProps) {
  const t = useTranslations("context.checklist");
  const [filter, setFilter] = React.useState("");

  if (isError) return <ErrorState title={t("loadError")} onRetry={onRetry} />;
  if (isLoading) {
    return (
      <div role="status" aria-label={t("loading")}>
        <Skeleton height={120} />
      </div>
    );
  }
  if (rows.length === 0) {
    return <EmptyState icon="FileText" title={t("empty.title")} body={t("empty.body", { roots: roots.join(", ") })} />;
  }

  const visible = filterRows(rows, filter);
  const total = rows.filter((r) => r.inheritedFrom === null).length;

  return (
    <div style={s.wrap}>
      <TextInput
        value={filter}
        onChange={setFilter}
        placeholder={t("filterPlaceholder")}
        aria-label={t("filterPlaceholder")}
      />
      <div style={s.summary}>
        <span>{t("attachedCount", { attached: attachedCount(rows), total })}</span>
        <span aria-live="polite">{t("estimate", { tokens: selectionTokens(rows) })}</span>
      </div>
      {visible.length === 0 ? (
        <p style={s.note}>{t("noMatch")}</p>
      ) : (
        <ul style={s.list} aria-label={t("listLabel")}>
          {visible.map((row) => {
            const index = rows.indexOf(row);
            return (
              <ContextRow
                key={`${row.inheritedFrom ?? ""}:${row.path}`}
                row={row}
                canMoveUp={canMove(rows, index, -1)}
                canMoveDown={canMove(rows, index, 1)}
                onToggle={() => onChange(toggleRow(rows, row.path))}
                onMove={(delta) => onChange(moveAttached(rows, index, delta))}
                onPreview={() => onPreview(row.path)}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
