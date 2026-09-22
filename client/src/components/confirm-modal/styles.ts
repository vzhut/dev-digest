import type { CSSProperties } from "react";

/** Co-located styles for ConfirmModal. */
export const s = {
  body: {
    margin: 0,
    padding: "18px 24px",
    fontSize: 13.5,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
} as const;
