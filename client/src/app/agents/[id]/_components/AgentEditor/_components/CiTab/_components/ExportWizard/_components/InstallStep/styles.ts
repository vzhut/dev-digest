import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 14, maxWidth: 640 } satisfies CSSProperties,
  methods: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  card: (selected: boolean): CSSProperties => ({
    width: "100%",
    textAlign: "left",
    padding: 18,
    borderRadius: 10,
    cursor: "pointer",
    color: "var(--text-primary)",
    border: "1.5px solid " + (selected ? "var(--accent)" : "var(--border)"),
    background: selected ? "var(--accent-bg)" : "var(--bg-surface)",
  }),
  cardHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 } satisfies CSSProperties,
  cardTitle: { fontSize: 14, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  cardBody: { margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
  blocked: {
    margin: 0,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    fontSize: 13,
  } satisfies CSSProperties,
  note: { margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
  success: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--ok)",
    background: "var(--ok-bg)",
    fontSize: 13,
  } satisfies CSSProperties,
  link: { color: "var(--accent-text)", fontWeight: 600 } satisfies CSSProperties,
} as const;
