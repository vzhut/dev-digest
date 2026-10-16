import type { CSSProperties } from "react";

export const s = {
  badge: (active: boolean): CSSProperties => ({
    width: 22,
    height: 22,
    borderRadius: 99,
    display: "grid",
    placeItems: "center",
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
    background: active ? "var(--accent-bg, var(--bg-hover))" : "var(--bg-hover)",
    color: active ? "var(--accent-text)" : "var(--text-muted)",
    border: "1px solid " + (active ? "var(--accent)" : "var(--border)"),
  }),
} as const;
