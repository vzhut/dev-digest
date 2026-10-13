import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "inline-flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  track: { display: "inline-block", width: 100, height: 5, borderRadius: 3, background: "var(--bg-hover)", overflow: "hidden" } satisfies CSSProperties,
  fill: (pct: number, color: string): CSSProperties => ({ display: "block", width: `${pct}%`, height: "100%", borderRadius: 3, background: color }),
  value: { fontSize: 11.5, color: "var(--text-muted)", minWidth: 34, textAlign: "right" } satisfies CSSProperties,
};
