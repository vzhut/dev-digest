import type { CSSProperties } from "react";

export const s = {
  pageHeader: { padding: "18px 28px 4px", display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  pageTitle: { fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  pageSubtitle: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  headerActions: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  loading: { padding: "16px 28px", fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
