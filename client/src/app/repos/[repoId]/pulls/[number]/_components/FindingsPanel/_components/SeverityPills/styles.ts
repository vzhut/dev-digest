import type { CSSProperties } from "react";

/** Co-located styles for SeverityPills. */
export const s = {
  row: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" } satisfies CSSProperties,
  separator: { color: "var(--text-muted)", fontSize: 12 } satisfies CSSProperties,
  /** `dimmed` = another pill is active, so this one recedes. */
  pill: (color: string, bg: string, pressed: boolean, dimmed: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 9px",
    borderRadius: 5,
    border: `1px solid ${pressed ? color : "transparent"}`,
    background: bg,
    color,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    cursor: "pointer",
    opacity: dimmed ? 0.55 : 1,
    transition: "opacity .12s, border-color .12s",
  }),
} as const;
