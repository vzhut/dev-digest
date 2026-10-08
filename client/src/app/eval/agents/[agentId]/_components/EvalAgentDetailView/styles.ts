import type { CSSProperties } from "react";

export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  topRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  back: { fontSize: 13, color: "var(--accent)" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" } satisfies CSSProperties,
  titleBox: { flex: 1, minWidth: 220 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 } satisfies CSSProperties,
  meta: { fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" } satisfies CSSProperties,
  select: { padding: "6px 8px", fontSize: 13, background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6 } satisfies CSSProperties,
  h2: { fontSize: 14, fontWeight: 600, margin: "0 0 10px" } satisfies CSSProperties,
  sectionHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  progress: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
};
