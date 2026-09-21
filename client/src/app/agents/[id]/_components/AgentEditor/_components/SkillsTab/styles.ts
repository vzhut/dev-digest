import type { CSSProperties } from "react";

/** Co-located styles for SkillsTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 6 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  counter: { marginLeft: "auto", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 } satisfies CSSProperties,
  list: { listStyle: "none", margin: "14px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  rowDragOver: { borderColor: "var(--accent)" } satisfies CSSProperties,
  handle: { cursor: "grab", color: "var(--text-tertiary)", userSelect: "none" } satisfies CSSProperties,
  label: { display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, cursor: "pointer" } satisfies CSSProperties,
  labelOff: { opacity: 0.6, cursor: "not-allowed" } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  desc: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  arrows: { display: "flex", gap: 2 } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, marginTop: 16 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-secondary)", marginTop: 14 } satisfies CSSProperties,
} as const;
