import type { CSSProperties } from "react";

export const s = {
  nav: {
    width: 220,
    flexShrink: 0,
    padding: "24px 16px",
    borderRight: "1px solid var(--border-subtle)",
    overflowY: "auto",
  } satisfies CSSProperties,
  label: {
    margin: "0 0 8px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  link: {
    display: "block",
    padding: "6px 10px",
    borderLeft: "2px solid transparent",
    fontSize: 13,
    color: "var(--text-secondary)",
    textDecoration: "none",
  } satisfies CSSProperties,
  linkActive: { borderLeft: "2px solid var(--accent)", color: "var(--text-primary)", fontWeight: 600 } satisfies CSSProperties,
};
