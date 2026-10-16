import type { CSSProperties } from "react";

/** Co-located styles for CiRunsTable. */
export const s = {
  box: { border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-surface)", overflow: "auto" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: {
    padding: "10px 12px",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  td: { padding: "12px", borderBottom: "1px solid var(--border)", verticalAlign: "top" } satisfies CSSProperties,
  nowrap: { whiteSpace: "nowrap" } satisfies CSSProperties,
  muted: { color: "var(--text-secondary)" } satisfies CSSProperties,
  strong: { fontWeight: 600 } satisfies CSSProperties,
  breakdown: { display: "block", marginTop: 2, fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  link: { color: "var(--accent-text)", textDecoration: "none" } satisfies CSSProperties,
  empty: { padding: 16, color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
} as const;
