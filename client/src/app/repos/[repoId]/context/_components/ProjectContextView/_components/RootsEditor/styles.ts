import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  title: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  textarea: {
    width: "100%",
    resize: "vertical",
    padding: "8px 10px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 13,
  } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--danger, #c0392b)" } satisfies CSSProperties,
  actions: { display: "flex", gap: 10 } satisfies CSSProperties,
};
