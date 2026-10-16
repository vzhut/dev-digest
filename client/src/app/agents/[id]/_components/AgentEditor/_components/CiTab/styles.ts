import type { CSSProperties } from "react";

/** Co-located styles for CiTab. */
export const s = {
  wrap: { maxWidth: 980, display: "flex", flexDirection: "column", gap: 22 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 14 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" } satisfies CSSProperties,
  activeNote: { fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  notice: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    color: "var(--text-primary)",
    fontSize: 13,
  } satisfies CSSProperties,
  failOn: { display: "block", maxWidth: 360 } satisfies CSSProperties,
  sectionTitle: { fontSize: 14, fontWeight: 600, margin: "0 0 10px" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
