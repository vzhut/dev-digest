import type { CSSProperties } from "react";

export const s = {
  container: { display: "flex", flexDirection: "column" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
