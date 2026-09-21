import type { CSSProperties } from "react";

/** Co-located styles for the AgentEditor shell. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", minWidth: 0 } satisfies CSSProperties,
  tabsBar: { marginTop: 14 } satisfies CSSProperties,
  body: { padding: 28 } satisfies CSSProperties,
} as const;
