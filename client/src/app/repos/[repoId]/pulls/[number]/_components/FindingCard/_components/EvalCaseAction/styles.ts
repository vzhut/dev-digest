import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "inline-flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  reason: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  tagWrap: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
};
