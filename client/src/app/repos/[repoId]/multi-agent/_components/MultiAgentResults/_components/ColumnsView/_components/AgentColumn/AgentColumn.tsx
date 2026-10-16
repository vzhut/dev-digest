/* AgentColumn — one agent's result card: header (icon tile, name, time · cost, score ring),
   a body with a live log tail / the failure reason / compact finding cards, and a footer with
   View trace and the findings count. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CircularScore, Icon, LiveLogStream, MonoLink, SEV, type Severity } from "@devdigest/ui";
import { AgentIcon } from "@/components/agent-icon";
import { agentAppearance } from "@/lib/agent-appearance";
import { LOG_TAIL_HEIGHT } from "../../../../constants";
import { lineRange } from "../../../../helpers";
import type { RunColumn } from "../../../../types";
import { useAgentLive } from "../../../../useAgentLive";
import { AgentMeta } from "../../../AgentMeta";
import { StatusTag } from "../../../StatusTag";
import { s } from "./styles";

export function AgentColumn({
  column,
  ranAt,
  now,
  onSettled,
  onViewTrace,
}: {
  column: RunColumn;
  ranAt: string;
  now: number;
  onSettled: () => void;
  onViewTrace: (runId: string) => void;
}) {
  const t = useTranslations("multiAgent.results");
  const { status, log, live } = useAgentLive(column, onSettled);
  const agent = { id: column.agent_id, name: column.agent_name };
  const color = agentAppearance(agent).color;
  const failedOrCancelled = status === "failed" || status === "cancelled";

  return (
    <section aria-label={column.agent_name} style={s.card}>
      <div style={s.head(color)}>
        <AgentIcon agent={agent} size={16} tile={30} />
        <div style={s.headMain}>
          <h3 style={s.name}>{column.agent_name}</h3>
          <AgentMeta column={column} status={status} ranAt={ranAt} now={now} />
          <StatusTag status={status} />
        </div>
        {status === "done" && column.score != null && <CircularScore score={column.score} size={32} stroke={3.5} />}
      </div>

      <div style={s.body}>
        {live && <LiveLogStream log={log} running height={LOG_TAIL_HEIGHT} />}
        {failedOrCancelled && (
          <p style={s.reason}>{status === "cancelled" ? t("cancelled") : (column.error ?? t("failedNoReason"))}</p>
        )}
        {status === "done" && column.findings.length === 0 && <p style={s.reason}>{t("noFindings")}</p>}
        {status === "done" &&
          column.findings.map((f) => {
            const sev = SEV[f.severity as Severity];
            const SevIcon = Icon[sev.icon];
            return (
              <div key={f.id} style={s.finding(sev.c)}>
                <div style={s.findingHead}>
                  <SevIcon size={12} style={{ color: sev.c, flexShrink: 0 }} aria-hidden />
                  <span style={s.findingTitle}>{f.title}</span>
                </div>
                <div className="mono" style={s.findingLoc}>
                  {f.file}:{lineRange(f.start_line, f.end_line)}
                </div>
              </div>
            );
          })}
      </div>

      <div style={s.footer}>
        <MonoLink onClick={() => onViewTrace(column.run_id)}>{t("viewTrace")}</MonoLink>
        <span style={s.count}>{t("findingCount", { count: column.findings.length })}</span>
      </div>
    </section>
  );
}
