/* RunHeader — the meta row under the page header: the PR on the left, the run's meta
   ("N agents · parallel · <wall> total · <cost>") on the right. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { MultiAgentRunDetail } from "@devdigest/shared";
import { useMultiAgentFormat } from "@/lib/hooks/multi-agent-format";
import { s } from "./styles";

export function RunHeader({ run }: { run: MultiAgentRunDetail }) {
  const t = useTranslations("multiAgent.results");
  const fmt = useMultiAgentFormat();
  return (
    <div style={s.wrap}>
      <span className="mono" style={s.number}>
        {run.pr_number != null ? `#${run.pr_number}` : t("prTitleUnknown")}
      </span>
      {run.pr_title && <span style={s.title}>{run.pr_title}</span>}
      <Badge>{t(`runStatus.${run.status}`)}</Badge>
      <span style={s.meta}>
        <Icon.Cpu size={14} style={s.metaIcon} />
        {fmt.runMeta(
          run.agent_count,
          run.total_duration_ms,
          run.columns.map((c) => c.cost_usd),
        )}
      </span>
    </div>
  );
}
