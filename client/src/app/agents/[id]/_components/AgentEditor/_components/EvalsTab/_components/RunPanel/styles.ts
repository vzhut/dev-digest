import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
};
