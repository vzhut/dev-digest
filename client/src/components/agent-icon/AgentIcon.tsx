/* AgentIcon — the agent's own icon in its own colour; `tile` puts it on a tinted rounded square. */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { agentAppearance } from "@/lib/agent-appearance";
import { s } from "./styles";

export function AgentIcon({
  agent,
  size = 16,
  tile = 0,
  color,
}: {
  agent: { id?: string | null; name: string };
  size?: number;
  /** Side of the tinted square in px; 0 = bare icon. */
  tile?: number;
  /** Override the colour (e.g. muted for an unselected tab). */
  color?: string;
}) {
  const a = agentAppearance(agent);
  const I = Icon[a.icon];
  const tint = color ?? a.color;
  if (!tile) return <I size={size} style={{ color: tint, flexShrink: 0 }} aria-hidden />;
  return (
    <span aria-hidden style={s.tile(tile, a.color, tint)}>
      <I size={size} />
    </span>
  );
}
