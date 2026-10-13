import type { CSSProperties } from "react";

export const s = {
  box: { border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-surface)", padding: "18px 22px" } satisfies CSSProperties,
  legend: { display: "flex", gap: 16, fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  needsTwo: { color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
  dot: (color: string): CSSProperties => ({ color }),
};
