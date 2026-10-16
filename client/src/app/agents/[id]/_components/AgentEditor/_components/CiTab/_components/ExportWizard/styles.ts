import type { CSSProperties } from "react";

export const s = {
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 22, minHeight: 360 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
} as const;
