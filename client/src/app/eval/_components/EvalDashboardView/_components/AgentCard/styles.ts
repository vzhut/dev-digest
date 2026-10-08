import type { CSSProperties } from "react";

export const s = {
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 16,
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    color: "inherit",
    textDecoration: "none",
  } satisfies CSSProperties,
  name: { fontSize: 15, fontWeight: 600 } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  metrics: { display: "flex", gap: 16 } satisfies CSSProperties,
  metricLabel: { fontSize: 10.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" } satisfies CSSProperties,
  metricValue: { fontSize: 18, fontWeight: 600 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
};
