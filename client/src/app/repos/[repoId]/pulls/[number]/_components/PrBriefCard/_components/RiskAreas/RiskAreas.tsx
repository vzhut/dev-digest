"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { FileRefButton } from "../FileRefButton";
import { SEVERITY_META } from "../../constants";
import { s } from "../../styles";

function RiskItem({
  risk,
  diffPaths,
  onOpenInDiff,
}: {
  risk: Risk;
  diffPaths: ReadonlySet<string>;
  onOpenInDiff: (file: string, line: number) => void;
}) {
  const t = useTranslations("brief");
  const [open, setOpen] = React.useState(false);
  const meta = SEVERITY_META[risk.severity] ?? SEVERITY_META.low;
  const SevIcon = Icon[meta.icon];
  const Chevron = Icon.ChevronDown;
  return (
    <li style={s.riskRow}>
      <div style={s.riskTop}>
        <div style={s.riskMain}>
          <div style={s.riskTitleRow}>
            <SevIcon size={14} color={meta.color} />
            {/* Model text: rendered as plain text, never markdown or HTML. */}
            <span>{risk.title}</span>
            <span style={{ ...s.riskSeverity, color: meta.color }}>{t(`risks.severity.${risk.severity}`)}</span>
          </div>
          <div style={s.refs}>
            {risk.file_refs.map((ref) => (
              <FileRefButton key={ref} fileRef={ref} diffPaths={diffPaths} onOpenInDiff={onOpenInDiff} />
            ))}
          </div>
        </div>
        <button
          type="button"
          style={s.riskToggle}
          aria-expanded={open}
          aria-label={t("risks.expand", { title: risk.title })}
          onClick={() => setOpen((v) => !v)}
        >
          <Chevron size={14} style={open ? { transform: "rotate(180deg)" } : undefined} />
        </button>
      </div>
      {open && <p style={s.riskExplanation}>{risk.explanation}</p>}
    </li>
  );
}

export function RiskAreas({
  risks,
  diffPaths,
  onOpenInDiff,
}: {
  risks: Risk[];
  diffPaths: ReadonlySet<string>;
  onOpenInDiff: (file: string, line: number) => void;
}) {
  const t = useTranslations("brief");
  return (
    <section style={s.section} aria-label={t("risks.title")}>
      <div style={s.sectionHead}>
        <Icon.AlertTriangle size={14} style={s.headIcon} />
        <span style={s.title}>{t("risks.title")}</span>
      </div>
      {risks.length === 0 ? (
        <p style={s.muted}>{t("noRisks")}</p>
      ) : (
        <ul style={s.list}>
          {risks.map((risk, i) => (
            <RiskItem key={`${risk.title}-${i}`} risk={risk} diffPaths={diffPaths} onOpenInDiff={onOpenInDiff} />
          ))}
        </ul>
      )}
    </section>
  );
}
