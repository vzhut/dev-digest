import type { CSSProperties } from "react";

export const s = {
  body: { padding: "4px 24px 20px", display: "flex", flexDirection: "column", gap: 14, fontSize: 13 } satisfies CSSProperties,
  h: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--text-muted)", margin: "0 0 4px", textTransform: "uppercase" } satisfies CSSProperties,
  tiles: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 } satisfies CSSProperties,
  tile: { minWidth: 0, padding: "12px 16px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-surface)" } satisfies CSSProperties,
  tileLabel: { fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" } satisfies CSSProperties,
  big: { fontSize: 24, fontWeight: 600, marginTop: 8, overflowWrap: "anywhere" } satisfies CSSProperties,
  small: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 8px", marginTop: 4, fontSize: 12.5 } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  secondary: { color: "var(--text-secondary)" } satisfies CSSProperties,
  delta: (color: string): CSSProperties => ({ fontWeight: 600, color }),
  metricColor: (color: string): CSSProperties => ({ color }),
  list: { margin: 0, paddingLeft: 18 } satisfies CSSProperties,
  legend: { display: "flex", gap: 16, fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 8 } satisfies CSSProperties,
  swatch: (color: string): CSSProperties => ({ display: "inline-block", width: 10, height: 10, borderRadius: 2, border: "1px solid var(--border-strong)", verticalAlign: "middle", background: color }),
  note: { padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border-strong)", background: "var(--bg-surface)" } satisfies CSSProperties,
  warn: { padding: "8px 12px", borderRadius: 6, border: "1px solid var(--warn)", background: "var(--bg-surface)" } satisfies CSSProperties,
  pre: { padding: "6px 0", background: "var(--code-bg)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, maxHeight: 320, overflowY: "auto" } satisfies CSSProperties,
  row: { display: "flex", gap: 8, padding: "1px 12px" } satisfies CSSProperties,
  mark: { width: 10, flexShrink: 0, userSelect: "none" } satisfies CSSProperties,
  text: { flex: 1, minWidth: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" } satisfies CSSProperties,
  gap: { padding: "3px 12px", color: "var(--text-muted)", fontStyle: "italic" } satisfies CSSProperties,
  line: {
    same: { color: "var(--text-muted)" },
    add: { color: "var(--code-add-text)", background: "var(--code-add)" },
    del: { color: "var(--code-del-text)", background: "var(--code-del)" },
  } satisfies Record<string, CSSProperties>,
};

export const MARKER = { same: " ", add: "+", del: "−" } as const;
