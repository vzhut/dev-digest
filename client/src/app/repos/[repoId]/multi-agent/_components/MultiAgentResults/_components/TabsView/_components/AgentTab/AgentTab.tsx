/* AgentTab — one agent's tab body: a summary card (score ring, name, the agent's summary,
   View trace, time · cost), then its findings as FindingCards. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CircularScore, LiveLogStream, MonoLink } from "@devdigest/ui";
import type { FindingActionKind } from "@devdigest/shared";
import { FindingCard } from "@/components/finding-card";
import { agentAppearance } from "@/lib/agent-appearance";
import { LOG_TAIL_HEIGHT } from "../../../../constants";
import type { RunColumn } from "../../../../types";
import { useAgentLive } from "../../../../useAgentLive";
import { AgentMeta } from "../../../AgentMeta";
import { StatusTag } from "../../../StatusTag";
import { s } from "./styles";

export function AgentTab({
  column,
  prId,
  multiAgentRunId,
  ranAt,
  now,
  pendingFindingId,
  onSettled,
  onViewTrace,
  onFindingAction,
}: {
  column: RunColumn;
  prId: string;
  multiAgentRunId: string;
  ranAt: string;
  now: number;
  pendingFindingId: string | null;
  onSettled: () => void;
  onViewTrace: (runId: string) => void;
  onFindingAction: (findingId: string, action: FindingActionKind) => void;
}) {
  const t = useTranslations("multiAgent.results");
  const { status, log, live } = useAgentLive(column, onSettled);
  const color = agentAppearance({ id: column.agent_id, name: column.agent_name }).color;
  const failedOrCancelled = status === "failed" || status === "cancelled";

  return (
    <div>
      <div style={s.summary(color)}>
        {status === "done" && column.score != null && <CircularScore score={column.score} size={44} />}
        <div style={s.summaryMain}>
          <h3 style={s.name(color)}>{column.agent_name}</h3>
          <StatusTag status={status} />
          {column.summary && <p style={s.text}>{column.summary}</p>}
          {failedOrCancelled && (
            <p style={s.text}>{status === "cancelled" ? t("cancelled") : (column.error ?? t("failedNoReason"))}</p>
          )}
        </div>
        <div style={s.side}>
          <MonoLink onClick={() => onViewTrace(column.run_id)}>{t("viewTrace")}</MonoLink>
          <AgentMeta column={column} status={status} ranAt={ranAt} now={now} />
        </div>
      </div>

      {live && <LiveLogStream log={log} running height={LOG_TAIL_HEIGHT} />}

      <div style={s.findings}>
        {status === "done" && column.findings.length === 0 && <p style={s.text}>{t("noFindings")}</p>}
        {column.findings.map((f) => (
          <FindingCard
            key={f.id}
            f={f}
            prId={prId}
            multiAgentRunId={multiAgentRunId}
            pending={pendingFindingId === f.id}
            onAction={(action) => onFindingAction(f.id, action)}
          />
        ))}
      </div>
    </div>
  );
}
