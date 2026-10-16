import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 20, maxWidth: 600 } satisfies CSSProperties,
  card: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 10,
    background: "var(--bg-surface)",
    border: "1.5px solid var(--accent)",
  } satisfies CSSProperties,
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    background: "var(--bg-elevated)",
    display: "grid",
    placeItems: "center",
    color: "var(--accent)",
  } satisfies CSSProperties,
  cardText: { flex: 1 } satisfies CSSProperties,
  cardTitle: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  cardDesc: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  field: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  label: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  empty: { margin: 0, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
