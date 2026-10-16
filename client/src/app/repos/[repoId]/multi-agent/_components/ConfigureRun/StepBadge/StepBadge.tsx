/* StepBadge — the numbered circle in front of a Configure run step title. */
import React from "react";
import { s } from "./styles";

export function StepBadge({ n, active }: { n: number; active: boolean }) {
  return (
    <span aria-hidden style={s.badge(active)}>
      {n}
    </span>
  );
}
