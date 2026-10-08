import type { CSSProperties } from "react";

export const s = {
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: {
    textAlign: "left",
    padding: "8px 10px",
    fontSize: 11.5,
    fontWeight: 600,
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  td: { padding: "8px 10px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  empty: { padding: 16, color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
};
