import type { CSSProperties } from "react";

export const s = {
  tag: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 600,
    color,
  }),
  dot: (color: string): CSSProperties => ({ width: 6, height: 6, borderRadius: 99, background: color }),
} as const;
