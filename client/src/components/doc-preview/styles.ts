import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  title: { fontSize: 13, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
  body: {
    padding: 12,
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 14,
    overflow: "auto",
    maxHeight: 480,
  } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
};
