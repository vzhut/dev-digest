import type { CSSProperties } from "react";

export const s = {
  page: { display: "flex", height: "100%", minHeight: 0 } satisfies CSSProperties,
  scroll: { flex: 1, minWidth: 0, overflowY: "auto", padding: "24px 32px 48px" } satisfies CSSProperties,
  column: { maxWidth: 900, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  band: { padding: "24px 32px" } satisfies CSSProperties,
  progress: {
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
  spin: { display: "inline-flex", animation: "ddspin 0.9s linear infinite" } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
};
