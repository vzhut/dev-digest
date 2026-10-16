import type { CSSProperties } from "react";

export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1260, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 14 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", margin: "4px 0 0" } satisfies CSSProperties,
  auto: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  autoDot: { width: 7, height: 7, borderRadius: 99, background: "var(--ok)" } satisfies CSSProperties,
  filters: { display: "flex", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  filter: { display: "block", minWidth: 220 } satisfies CSSProperties,
  filterLabel: { display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)", padding: 16 } satisfies CSSProperties,
} as const;
