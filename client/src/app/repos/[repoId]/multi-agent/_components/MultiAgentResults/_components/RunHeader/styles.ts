import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 28px",
    borderBottom: "1px solid var(--border)",
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  title: {
    fontWeight: 600,
    color: "var(--text-primary)",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  number: { color: "var(--text-muted)" } satisfies CSSProperties,
  meta: { marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  metaIcon: { color: "var(--accent)" } satisfies CSSProperties,
} as const;
