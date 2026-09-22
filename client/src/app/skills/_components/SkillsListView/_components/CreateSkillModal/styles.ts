import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillModal. */
export const s = {
  form: { display: "flex", flexDirection: "column", gap: 4, padding: "18px 24px" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", margin: "8px 0 0" } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
