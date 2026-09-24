import type { CSSProperties } from "react";

/** Co-located styles for ImportPreview. */
export const s = {
  root: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  label: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 } satisfies CSSProperties,
  list: { margin: 0, paddingLeft: 18, fontSize: 13 } satisfies CSSProperties,
  note: { fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" } satisfies CSSProperties,
  warn: { fontSize: 13, color: "var(--warn, var(--text-primary))" } satisfies CSSProperties,
  choice: { display: "flex", alignItems: "center", gap: 8, fontSize: 13 } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
