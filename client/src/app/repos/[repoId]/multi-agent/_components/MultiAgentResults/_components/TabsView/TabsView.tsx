/* TabsView — one tab per agent; only the selected agent's body is rendered. */
"use client";

import React from "react";
import type { FindingActionKind } from "@devdigest/shared";
import { AgentIcon } from "@/components/agent-icon";
import { agentAppearance } from "@/lib/agent-appearance";
import { scoreColor } from "../../helpers";
import type { RunColumn } from "../../types";
import { s } from "./styles";
import { AgentTab } from "./_components/AgentTab";

const PANEL_ID = "multi-agent-tabpanel";
const tabId = (runId: string) => `multi-agent-tab-${runId}`;

export function TabsView({
  columns,
  tab,
  onTabChange,
  ...tabProps
}: {
  columns: RunColumn[];
  /** Selected agent's run id; falls back to the first agent. */
  tab: string | null;
  onTabChange: (runId: string) => void;
  prId: string;
  multiAgentRunId: string;
  ranAt: string;
  now: number;
  pendingFindingId: string | null;
  onSettled: () => void;
  onViewTrace: (runId: string) => void;
  onFindingAction: (findingId: string, action: FindingActionKind) => void;
}) {
  const selected = columns.find((c) => c.run_id === tab) ?? columns[0];
  if (!selected) return null;

  // Arrow keys / Home / End move between tabs (roving tabindex), as the tab roles promise.
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const i = columns.findIndex((c) => c.run_id === selected.run_id);
    const next =
      e.key === "ArrowRight" ? (i + 1) % columns.length
      : e.key === "ArrowLeft" ? (i - 1 + columns.length) % columns.length
      : e.key === "Home" ? 0
      : e.key === "End" ? columns.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    const target = columns[next];
    if (!target) return;
    onTabChange(target.run_id);
    document.getElementById(tabId(target.run_id))?.focus();
  };

  return (
    <div>
      <div role="tablist" style={s.strip}>
        {columns.map((c) => {
          const score = c.status === "done" ? c.score : null;
          const isSelected = c.run_id === selected.run_id;
          return (
            <button
              key={c.run_id}
              id={tabId(c.run_id)}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={PANEL_ID}
              tabIndex={isSelected ? 0 : -1}
              style={s.tab(isSelected, agentAppearance({ id: c.agent_id, name: c.agent_name }).color)}
              onClick={() => onTabChange(c.run_id)}
              onKeyDown={onKeyDown}
            >
              <AgentIcon
                agent={{ id: c.agent_id, name: c.agent_name }}
                size={15}
                color={isSelected ? undefined : "var(--text-muted)"}
              />
              <span style={s.tabName(isSelected)}>{c.agent_name}</span>
              <span className="tnum" style={s.tabScore(scoreColor(score))}>
                {score ?? "—"}
              </span>
            </button>
          );
        })}
      </div>
      <div id={PANEL_ID} role="tabpanel" aria-labelledby={tabId(selected.run_id)} style={s.body}>
        <AgentTab key={selected.run_id} column={selected} {...tabProps} />
      </div>
    </div>
  );
}
