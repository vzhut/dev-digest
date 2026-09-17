/* SeverityPills — "3 CRITICAL · 5 WARNING · 2 SUGGESTION" counters for one run.
   Each pill is a toggle button: click filters the list to that severity, clicking
   the active pill clears it. Spec: client/specs/run-severity-filter.md */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import type { SeverityCount } from "@/lib/severity";
import { s } from "./styles";

export function SeverityPills({
  counts,
  active,
  onToggle,
}: {
  counts: SeverityCount[];
  active: Severity | null;
  onToggle: (severity: Severity) => void;
}) {
  const t = useTranslations("prReview");
  if (counts.length === 0) return null;

  return (
    <div role="group" aria-label={t("panel.severityFilterGroup")} style={s.row}>
      {counts.map(({ severity, count }, i) => {
        const meta = SEV[severity];
        const SevIcon = Icon[meta.icon];
        const pressed = active === severity;
        return (
          <React.Fragment key={severity}>
            {i > 0 && (
              <span aria-hidden style={s.separator}>
                ·
              </span>
            )}
            <button
              type="button"
              aria-pressed={pressed}
              aria-label={t("panel.severityFilter", { severity, count })}
              onClick={() => onToggle(severity)}
              style={s.pill(meta.c, meta.bg, pressed, active != null && !pressed)}
            >
              <SevIcon size={12.5} />
              <span className="tnum">{count}</span>
              <span>{severity}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
