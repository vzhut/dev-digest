/* AgentMeta — mono "time · cost" of one agent's run (elapsed while live, actual once settled). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { formatDuration } from "@/lib/eval-format";
import { formatCostUsd } from "@/lib/multi-agent-format";
import { elapsedMs, type DisplayStatus } from "../../helpers";
import type { RunColumn } from "../../types";
import { s } from "./styles";

export function AgentMeta({
  column,
  status,
  ranAt,
  now,
}: {
  column: RunColumn;
  status: DisplayStatus;
  ranAt: string;
  now: number;
}) {
  const t = useTranslations("multiAgent.results");
  const live = status === "queued" || status === "running";
  const time = formatDuration(live ? elapsedMs(ranAt, now) : column.duration_ms);
  const cost = column.cost_usd == null ? t("costUnknown") : formatCostUsd(column.cost_usd);
  return (
    <span className="mono tnum" style={s.meta}>
      {time} · {cost}
    </span>
  );
}
