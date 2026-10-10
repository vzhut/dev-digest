import type { CSSProperties } from "react";

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  tiles: { display: "flex", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  tile: {
    minWidth: 130,
    padding: "10px 14px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  tileLabel: { fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.04em", textTransform: "uppercase" } satisfies CSSProperties,
  tileValue: { fontSize: 20, fontWeight: 600, marginTop: 2 } satisfies CSSProperties,
  notice: { padding: "8px 12px", borderRadius: 6, background: "var(--crit-bg)", color: "var(--crit)", fontSize: 13 } satisfies CSSProperties,
  heading: { fontSize: 13, fontWeight: 600, margin: 0 } satisfies CSSProperties,
  caseCard: { border: "1px solid var(--border)", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  caseHead: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" } satisfies CSSProperties,
  caseName: { fontWeight: 600, fontSize: 13 } satisfies CSSProperties,
  list: { margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 } satisfies CSSProperties,
  label: { fontSize: 11, fontWeight: 600, padding: "1px 6px", borderRadius: 4, border: "1px solid var(--border-strong)", marginLeft: 6 } satisfies CSSProperties,
  muted: { color: "var(--text-muted)", fontSize: 12.5 } satisfies CSSProperties,
};
