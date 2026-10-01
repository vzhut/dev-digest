import type { CSSProperties } from "react";

/** Co-located styles for ContextTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, marginBottom: 6 } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 } satisfies CSSProperties,
  preview: { marginTop: 14 } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, marginTop: 16 } satisfies CSSProperties,
} as const;
