import type { CSSProperties } from "react";

/** Co-located styles for ProjectContextSection. */
export const s = {
  wrap: { marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--border)" } satisfies CSSProperties,
  h3: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-muted)", margin: "4px 0 12px" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, marginTop: 12 } satisfies CSSProperties,
  panel: {
    marginTop: 16,
    padding: 12,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated, transparent)",
  } satisfies CSSProperties,
  panelTitle: { fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: "var(--text-muted)" } satisfies CSSProperties,
  pre: { margin: "8px 0", fontSize: 12, whiteSpace: "pre-wrap" } satisfies CSSProperties,
  preview: { marginTop: 12 } satisfies CSSProperties,
} as const;
