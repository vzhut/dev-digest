import type { CSSProperties } from "react";

export const s = {
  group: {
    display: "flex",
    gap: 2,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: 2,
  } satisfies CSSProperties,
  option: (on: boolean): CSSProperties => ({
    padding: "4px 12px",
    fontSize: 11.5,
    fontWeight: 600,
    borderRadius: 5,
    border: "none",
    cursor: "pointer",
    background: on ? "var(--bg-elevated)" : "transparent",
    color: on ? "var(--text-primary)" : "var(--text-muted)",
  }),
} as const;
