/* ConflictsSection — "Where agents disagree": one card per contended file:line with one cell
   per agent (severity and its note when it flagged the spot, "did not flag" when it
   completed without flagging, a marker when it failed / was cancelled / is still running).
   "Show only conflicts" keeps the locations the server marked `is_conflict`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV, SectionLabel, Toggle, type Severity } from "@devdigest/ui";
import { lineRange, takeKind, visibleConflicts } from "../../helpers";
import type { RunColumn, RunConflict } from "../../types";
import { s } from "./styles";

export function ConflictsSection({
  conflicts,
  columns,
  onlyConflicts,
  onToggleOnly,
}: {
  conflicts: RunConflict[];
  columns: RunColumn[];
  onlyConflicts: boolean;
  onToggleOnly: (only: boolean) => void;
}) {
  const t = useTranslations("multiAgent.results.conflicts");
  const rows = visibleConflicts(conflicts, onlyConflicts);
  const disagreeing = conflicts.filter((c) => c.is_conflict).length;
  const nameOf = (agentId: string, fallback: string) =>
    columns.find((c) => c.agent_id === agentId)?.agent_name ?? fallback;

  return (
    <section aria-label={t("title")} style={s.wrap}>
      <SectionLabel
        icon="Activity"
        right={
          <span style={s.right}>
            {conflicts.length > 0 && (
              <span className="tnum" style={s.count} aria-live="polite">
                {onlyConflicts
                  ? t("showing", { shown: rows.length, total: conflicts.length })
                  : t("disagreeCount", { conflicts: disagreeing, total: conflicts.length })}
              </span>
            )}
            <label style={s.toggle}>
              {t("onlyConflicts")}
              <Toggle on={onlyConflicts} onChange={onToggleOnly} size={15} />
            </label>
          </span>
        }
      >
        {t("title")}
      </SectionLabel>

      {rows.length === 0 ? (
        <p style={s.empty}>{onlyConflicts ? t("noneConflicting") : t("none")}</p>
      ) : (
        <div style={s.list}>
          {rows.map((c, i) => (
            <div key={`${c.file}:${c.line}:${i}`} style={s.card}>
              <div style={s.head}>
                <Icon.Code size={13} style={s.headIcon} />
                <span className="mono" style={s.loc}>
                  {c.file}:{lineRange(c.line, c.end_line)}
                </span>
                <span style={s.title}>{c.title}</span>
              </div>
              <div style={s.cells(c.takes.length)}>
                {c.takes.map((take) => {
                  const kind = takeKind(take);
                  const sev = kind === "flagged" ? SEV[take.verdict as Severity] : null;
                  return (
                    <div key={take.agent_id} style={s.cell}>
                      <div style={s.agent}>{nameOf(take.agent_id, take.persona)}</div>
                      <div style={s.verdict}>
                        <span aria-hidden style={s.dot(sev?.c ?? "var(--text-muted)")} />
                        <span style={s.verdictLabel(!!sev)}>{sev ? take.verdict : t(`take.${kind}`)}</span>
                      </div>
                      {sev && take.note && <div style={s.note}>{take.note}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
