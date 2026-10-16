import type { CSSProperties } from "react";

export const s = {
  strip: {
    display: "flex",
    gap: 2,
    padding: "0 28px",
    borderBottom: "1px solid var(--border)",
    overflowX: "auto",
  } satisfies CSSProperties,
  tab: (on: boolean, agentColor: string): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 16px",
    border: "none",
    background: "transparent",
    borderBottom: "2px solid " + (on ? agentColor : "transparent"),
    marginBottom: -1,
    cursor: "pointer",
    whiteSpace: "nowrap",
  }),
  tabName: (on: boolean): CSSProperties => ({
    fontSize: 13,
    fontWeight: on ? 600 : 500,
    color: on ? "var(--text-primary)" : "var(--text-secondary)",
  }),
  tabScore: (color: string): CSSProperties => ({ fontSize: 11, fontWeight: 700, color }),
  body: { padding: "20px 28px 22px", maxWidth: 760 } satisfies CSSProperties,
} as const;
