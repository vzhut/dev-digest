import type { CSSProperties } from "react";

export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "12px 16px",
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  main: { display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 } satisfies CSSProperties,
  repo: { fontSize: 13, fontWeight: 600, wordBreak: "break-all" } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  badges: { display: "flex", gap: 6, flexWrap: "wrap" } satisfies CSSProperties,
  last: { fontSize: 12, color: "var(--text-secondary)", minWidth: 190 } satisfies CSSProperties,
  link: { fontSize: 12.5, color: "var(--accent-text)", whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;
