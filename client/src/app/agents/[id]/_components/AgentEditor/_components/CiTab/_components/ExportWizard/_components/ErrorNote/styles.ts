import type { CSSProperties } from "react";

export const s = {
  box: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    color: "var(--text-primary)",
    fontSize: 13,
    lineHeight: 1.5,
  } satisfies CSSProperties,
} as const;
