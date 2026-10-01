"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { BlastStats } from "@devdigest/shared";
import { s } from "./styles";

/** The stat pills for the blast-radius block: symbols, callers, endpoints, crons. */
export function BlastSummary({ stats }: { stats: BlastStats }) {
  const t = useTranslations("blast");
  return (
    <div style={s.row}>
      <Badge>
        {stats.symbols_changed} {t("stat.symbols")}
      </Badge>
      <Badge>
        {stats.callers} {t("stat.callers")}
      </Badge>
      <Badge>
        {stats.endpoints} {t("stat.endpoints")}
      </Badge>
      <Badge>
        {stats.crons} {t("stat.crons")}
      </Badge>
    </div>
  );
}
