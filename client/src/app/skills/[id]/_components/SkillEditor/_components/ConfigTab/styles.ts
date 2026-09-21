import type { CSSProperties } from "react";

/** Co-located styles for ConfigTab. */
export const s = {
  wrap: { maxWidth: 900 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 24 } satisfies CSSProperties,
  h2: { fontSize: 22, fontWeight: 700 } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, marginTop: 4 } satisfies CSSProperties,
  snapshotNote: { marginLeft: "auto", fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  strong: { color: "var(--text-secondary)", fontWeight: 600 } satisfies CSSProperties,
  danger: {
    marginTop: 32,
    paddingTop: 24,
    borderTop: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    gap: 16,
  } satisfies CSSProperties,
  dangerTitle: { fontSize: 14, fontWeight: 600, color: "var(--crit)" } satisfies CSSProperties,
  dangerText: { fontSize: 13, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
  dangerBtn: { marginLeft: "auto" } satisfies CSSProperties,
} as const;
