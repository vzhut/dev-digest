import type { CSSProperties } from "react";

/** Co-located styles for VersionsTab. */
export const s = {
  wrap: { padding: 20 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", margin: "0 0 18px" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 14, padding: "14px 16px" } satisfies CSSProperties,
  chip: {
    minWidth: 40,
    textAlign: "center",
    padding: "8px 6px",
    borderRadius: 6,
    background: "var(--bg-surface)",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  chipCurrent: { color: "var(--accent-text)", background: "var(--accent-bg)" } satisfies CSSProperties,
  text: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  title: { fontSize: 14, fontWeight: 500, color: "var(--text-primary)" } satisfies CSSProperties,
  titleMuted: { fontSize: 14, color: "var(--text-muted)" } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)", marginTop: 3 } satisfies CSSProperties,
  actions: { display: "flex", gap: 8 } satisfies CSSProperties,
  diff: {
    margin: 0,
    padding: 12,
    borderTop: "1px solid var(--border)",
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
