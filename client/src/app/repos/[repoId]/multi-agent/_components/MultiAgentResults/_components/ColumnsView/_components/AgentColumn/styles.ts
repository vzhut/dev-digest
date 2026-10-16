import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minWidth: 0,
  } satisfies CSSProperties,
  head: (color: string): CSSProperties => ({
    padding: 12,
    borderBottom: "1px solid var(--border)",
    borderTop: "2px solid " + color,
    display: "flex",
    alignItems: "center",
    gap: 9,
  }),
  headMain: { minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  name: {
    fontSize: 12.5,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  body: { padding: 12, display: "flex", flexDirection: "column", gap: 7, flex: 1 } satisfies CSSProperties,
  reason: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  finding: (sevColor: string): CSSProperties => ({
    padding: "8px 10px",
    borderRadius: 6,
    background: "var(--bg-surface)",
    borderLeft: "2px solid " + sevColor,
  }),
  findingHead: { display: "flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  findingTitle: { fontSize: 12, fontWeight: 600, lineHeight: 1.3 } satisfies CSSProperties,
  findingLoc: { fontSize: 10.5, color: "var(--text-muted)", marginTop: 4, overflowWrap: "anywhere" } satisfies CSSProperties,
  footer: {
    padding: "9px 12px",
    borderTop: "1px solid var(--border)",
    background: "var(--bg-surface)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  } satisfies CSSProperties,
  count: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
