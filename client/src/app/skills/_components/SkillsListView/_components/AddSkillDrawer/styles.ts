import type { CSSProperties } from "react";

/** Co-located styles for AddSkillDrawer. */
export const s = {
  hint: { fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", margin: "8px 0" } satisfies CSSProperties,
} as const;
