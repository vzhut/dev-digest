import type { CSSProperties } from "react";

export const s = {
  notice: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 6,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    fontSize: 13,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  icon: { color: "var(--warn)", flexShrink: 0, marginTop: 1 } satisfies CSSProperties,
  body: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  resyncRow: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  resyncButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: "1px solid var(--border)",
    borderRadius: 5,
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 8px",
    cursor: "pointer",
  } satisfies CSSProperties,
  resyncStatus: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
