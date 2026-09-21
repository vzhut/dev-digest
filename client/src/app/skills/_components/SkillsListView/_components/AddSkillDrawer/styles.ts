import type { CSSProperties } from "react";

/** Co-located styles for AddSkillDrawer. */
export const s = {
  modes: { display: "flex", gap: 8, marginBottom: 16 } satisfies CSSProperties,
  form: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", margin: "8px 0" } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
