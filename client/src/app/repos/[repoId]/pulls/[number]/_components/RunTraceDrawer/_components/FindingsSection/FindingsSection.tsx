/* FindingsSection — the persisted findings of THIS run (same data as the
   "Review runs" list), rendered inside a collapsible TraceSection. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { s } from "../../styles";
import { TraceSection } from "../TraceSection";

const SEV_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--accent)",
};

export function FindingsSection({ findings }: { findings: FindingRecord[] }) {
  const t = useTranslations("runs");
  return (
    <TraceSection
      icon="AlertOctagon"
      title={t("trace.findings")}
      right={<Badge color="var(--text-muted)">{findings.length}</Badge>}
    >
      {findings.length === 0 ? (
        <span style={s.noToolCalls}>{t("trace.noFindings")}</span>
      ) : (
        <div style={s.findingList}>
          {findings.map((f) => (
            <div
              key={f.id}
              style={s.findingCard}
            >
              <div style={s.findingHead}>
                <Badge color={SEV_COLOR[f.severity] ?? "var(--text-muted)"} bg="transparent">
                  {f.severity}
                </Badge>
                <span style={s.findingTitle}>{f.title}</span>
              </div>
              <div className="mono" style={s.findingLoc}>
                {f.file}:{f.start_line}
                {f.end_line !== f.start_line ? `-${f.end_line}` : ""}
              </div>
              <div style={s.findingText}>
                {f.rationale}
              </div>
              {f.suggestion && (
                <div style={s.findingFix}>
                  <strong>{t("trace.suggestedFix")} </strong>
                  {f.suggestion}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </TraceSection>
  );
}
