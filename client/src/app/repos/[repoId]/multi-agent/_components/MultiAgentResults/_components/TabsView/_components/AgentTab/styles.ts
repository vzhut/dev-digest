import type { CSSProperties } from "react";

export const s = {
  summary: (color: string): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    borderRadius: 9,
    border: "1px solid var(--border)",
    borderLeft: "3px solid " + color,
    background: "var(--bg-elevated)",
    marginBottom: 18,
  }),
  summaryMain: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  name: (color: string): CSSProperties => ({ fontSize: 14, fontWeight: 600, color }),
  text: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.5 } satisfies CSSProperties,
  side: {
    marginLeft: "auto",
    textAlign: "right",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 4,
  } satisfies CSSProperties,
  findings: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
} as const;
