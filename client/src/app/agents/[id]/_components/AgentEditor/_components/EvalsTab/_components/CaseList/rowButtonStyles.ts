import type { CSSProperties } from "react";

export const rb = {
  base: {
    width: 30,
    height: 30,
    display: "inline-grid",
    placeItems: "center",
    borderRadius: 6,
    border: "1px solid transparent",
    background: "transparent",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  enabled: { cursor: "pointer" } satisfies CSSProperties,
  disabled: { opacity: 0.4, cursor: "not-allowed" } satisfies CSSProperties,
};
