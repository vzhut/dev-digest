import type { CSSProperties } from "react";

export const s = {
  box: { border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-surface)", overflow: "hidden" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 } satisfies CSSProperties,
  th: {
    textAlign: "left",
    padding: "12px 12px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  td: { padding: "12px 12px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" } satisfies CSSProperties,
  row: (selected: boolean): CSSProperties => ({ background: selected ? "var(--bg-hover)" : "transparent" }),
  when: { color: "var(--text-secondary)", fontSize: 13 } satisfies CSSProperties,
  version: { color: "var(--accent)" } satisfies CSSProperties,
  passed: { fontWeight: 700 } satisfies CSSProperties,
  cost: { color: "var(--text-secondary)", fontSize: 13 } satisfies CSSProperties,
  // a real button styled as a checkbox: a native one renders as a white square in the dark theme
  checkbox: (checked: boolean): CSSProperties => ({
    width: 16,
    height: 16,
    padding: 0,
    borderRadius: 4,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    border: `1.5px solid ${checked ? "var(--accent)" : "var(--border-strong)"}`,
    background: checked ? "var(--accent)" : "var(--bg-surface)",
  }),
  check: { color: "#fff" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  empty: { padding: 16, color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
};
