import type { CSSProperties } from "react";

/** Co-located styles for VersionsTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, marginBottom: 16 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    marginBottom: 8,
  } satisfies CSSProperties,
  rowDate: { fontSize: 12, color: "var(--text-muted)", flex: 1 } satisfies CSSProperties,
  diff: {
    margin: "0 0 12px",
    padding: 10,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
    fontSize: 12,
    overflow: "auto",
  } satisfies CSSProperties,
  diffTitle: { fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 } satisfies CSSProperties,
  line: (kind: "same" | "add" | "del"): CSSProperties => ({
    whiteSpace: "pre-wrap",
    color: kind === "add" ? "var(--ok)" : kind === "del" ? "var(--danger, #e5484d)" : "var(--text-secondary)",
  }),
} as const;
