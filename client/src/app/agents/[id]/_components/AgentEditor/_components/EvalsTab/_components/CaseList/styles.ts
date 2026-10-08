import type { CSSProperties } from "react";

export const s = {
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 } satisfies CSSProperties,
  h3: { fontSize: 14, fontWeight: 600, margin: 0 } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: { textAlign: "left", padding: "8px 10px", fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  td: { padding: "8px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" } satisfies CSSProperties,
  actions: { display: "flex", gap: 6 } satisfies CSSProperties,
  empty: { padding: 16, color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
};
