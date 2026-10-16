/* ModeSwitch — the segmented Columns / Tabs control in the page header. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MODES, type Mode } from "../../../../constants";
import { s } from "./styles";

export function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const t = useTranslations("multiAgent.results.mode");
  return (
    <div role="group" aria-label={t("label")} style={s.group}>
      {MODES.map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} style={s.option(mode === m)} onClick={() => onChange(m)}>
          {t(m)}
        </button>
      ))}
    </div>
  );
}
