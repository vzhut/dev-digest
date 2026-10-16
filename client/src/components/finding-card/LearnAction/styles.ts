import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "inline-flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  error: { fontSize: 11.5, color: "var(--crit)" } satisfies CSSProperties,
};
