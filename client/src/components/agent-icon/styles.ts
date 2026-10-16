import type { CSSProperties } from "react";

export const s = {
  /** The tinted rounded square behind an agent icon; `color` is the agent's colour (12% tint). */
  tile: (side: number, color: string, tint: string): CSSProperties => ({
    width: side,
    height: side,
    borderRadius: 8,
    display: "grid",
    placeItems: "center",
    background: `${color}1f`,
    color: tint,
    flexShrink: 0,
  }),
} as const;
