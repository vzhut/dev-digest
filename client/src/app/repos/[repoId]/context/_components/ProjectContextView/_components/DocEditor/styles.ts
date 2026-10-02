import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  notice: {
    margin: 0,
    padding: "8px 12px",
    borderRadius: 7,
    fontSize: 12.5,
    color: "var(--warn)",
    background: "var(--warn-bg)",
  } satisfies CSSProperties,
  textarea: {
    width: "100%",
    minHeight: 360,
    resize: "vertical",
    padding: "12px 14px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 13,
    lineHeight: 1.55,
    outline: "none",
  } satisfies CSSProperties,
  error: { margin: 0, fontSize: 12.5, color: "var(--crit)" } satisfies CSSProperties,
  actions: { display: "flex", gap: 10 } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
};
