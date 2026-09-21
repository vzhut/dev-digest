import type { CSSProperties } from "react";

/** Co-located styles for StatsTab. */
export const s = {
  root: { display: "flex", flexDirection: "column", gap: 20, padding: 20 } satisfies CSSProperties,
  tiles: { display: "flex", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  caveat: { fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, margin: 0 } satisfies CSSProperties,
  sectionLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.03em",
    marginBottom: 8,
  } satisfies CSSProperties,
  agentRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 0",
    fontSize: 13,
  } satisfies CSSProperties,
  muted: { color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
} as const;
