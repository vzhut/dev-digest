import type { CSSProperties } from "react";

export const s = {
  /** Sections pad themselves (28px, as in the design); this wrapper only stacks them. */
  page: { display: "flex", flexDirection: "column" } satisfies CSSProperties,
  loading: { padding: "20px 28px" } satisfies CSSProperties,
  conflicts: { padding: "0 28px 40px" } satisfies CSSProperties,
} as const;
