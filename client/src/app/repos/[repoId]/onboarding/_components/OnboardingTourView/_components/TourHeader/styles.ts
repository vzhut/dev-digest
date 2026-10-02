import type { CSSProperties } from "react";

export const s = {
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" } satisfies CSSProperties,
  titleBlock: { minWidth: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  title: { margin: 0, fontSize: 24, fontWeight: 700 } satisfies CSSProperties,
  repo: { color: "var(--accent)" } satisfies CSSProperties,
  subtitle: { margin: 0, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  note: { margin: 0, fontSize: 12.5, color: "var(--text-tertiary)" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
};
