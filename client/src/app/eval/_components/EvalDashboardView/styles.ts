import type { CSSProperties } from "react";

export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1260, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 14 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", margin: "4px 0 0" } satisfies CSSProperties,
  h2: { fontSize: 14, fontWeight: 600, margin: "0 0 10px" } satisfies CSSProperties,
  grid: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  report: { fontSize: 13, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
};
