import type { CSSProperties } from "react";

export const s = {
  header: {
    position: "sticky",
    top: 0,
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "8px 12px",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    color: "var(--text)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
  } satisfies CSSProperties,
  count: { color: "var(--text-muted)", fontWeight: 400 } satisfies CSSProperties,
  findings: {
    marginLeft: "auto",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    color: "var(--text-muted)",
    fontWeight: 400,
  } satisfies CSSProperties,
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "var(--accent)",
  } satisfies CSSProperties,
  body: { marginTop: 8 } satisfies CSSProperties,
  wrap: { marginBottom: 14 } satisfies CSSProperties,
} as const;
