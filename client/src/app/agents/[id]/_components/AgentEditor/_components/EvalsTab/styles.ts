import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 980, display: "flex", flexDirection: "column", gap: 24 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" } satisfies CSSProperties,
  sectionHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 } satisfies CSSProperties,
  h3: { fontSize: 14, fontWeight: 600, margin: 0 } satisfies CSSProperties,
  link: { fontSize: 13, color: "var(--accent)" } satisfies CSSProperties,
};
