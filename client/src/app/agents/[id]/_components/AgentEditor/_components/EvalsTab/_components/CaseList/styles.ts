import type { CSSProperties } from "react";

export const s = {
  head: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" } satisfies CSSProperties,
  h3: { fontSize: 18, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  count: { fontSize: 12.5, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: "var(--ok-bg)", color: "var(--ok)" } satisfies CSSProperties,
  actions: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10, listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-surface)" } satisfies CSSProperties,
  statusIcon: { width: 20, display: "grid", placeItems: "center", flexShrink: 0 } satisfies CSSProperties,
  dot: { width: 6, height: 6, borderRadius: 3, border: "1.5px solid var(--text-muted)" } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  name: { fontSize: 15, fontWeight: 600 } satisfies CSSProperties,
  detail: { fontSize: 13, color: "var(--text-muted)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  chip: { fontSize: 12.5, padding: "3px 10px", borderRadius: 6, background: "var(--bg-hover)", color: "var(--text-secondary)", whiteSpace: "nowrap" } satisfies CSSProperties,
  buttons: { display: "flex", gap: 2 } satisfies CSSProperties,
  empty: { padding: 16, color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
};
