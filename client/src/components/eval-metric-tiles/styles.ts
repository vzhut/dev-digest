import type { CSSProperties } from "react";

export const s = {
  row: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 } satisfies CSSProperties,
  tile: { padding: "14px 18px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-surface)" } satisfies CSSProperties,
  top: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 } satisfies CSSProperties,
  label: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 } satisfies CSSProperties,
  valueRow: { display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 } satisfies CSSProperties,
  value: (color: string): CSSProperties => ({ fontSize: 30, fontWeight: 600, color, letterSpacing: "-0.02em" }),
  unit: { fontSize: 15, color: "var(--text-muted)", marginLeft: 1 } satisfies CSSProperties,
  delta: (color: string): CSSProperties => ({ fontSize: 12.5, fontWeight: 600, color }),
};
