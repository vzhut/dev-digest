import type { CSSProperties } from "react";

export const s = {
  stack: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-hover)",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  text: { flex: 1, minWidth: 0, margin: 0 } satisfies CSSProperties,
};
