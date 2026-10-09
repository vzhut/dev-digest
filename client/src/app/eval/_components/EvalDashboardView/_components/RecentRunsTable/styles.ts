import type { CSSProperties } from "react";

export const s = {
  box: { border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-surface)", overflow: "hidden" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 } satisfies CSSProperties,
  // headers stay for assistive tech; the mock shows none
  srOnly: { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" } satisfies CSSProperties,
  td: { padding: "14px 12px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" } satisfies CSSProperties,
  first: { paddingLeft: 22 } satisfies CSSProperties,
  agent: { fontWeight: 700 } satisfies CSSProperties,
  when: { color: "var(--text-secondary)", fontSize: 13 } satisfies CSSProperties,
  version: { color: "var(--accent)" } satisfies CSSProperties,
  passed: { fontWeight: 700, paddingRight: 22 } satisfies CSSProperties,
  empty: { padding: 16, color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
};
