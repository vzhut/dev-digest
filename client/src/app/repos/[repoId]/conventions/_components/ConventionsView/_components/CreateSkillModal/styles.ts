import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillModal. */
export const s = {
  form: { display: "flex", flexDirection: "column", gap: 4, padding: "18px 24px" } satisfies CSSProperties,
  tokens: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  agentList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    maxHeight: 160,
    overflowY: "auto",
    padding: "4px 2px",
  } satisfies CSSProperties,
  noAgents: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  versionNote: {
    fontSize: 12,
    color: "var(--text-muted)",
    margin: "4px 0 0",
  } satisfies CSSProperties,
  conflict: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    marginTop: 8,
  } satisfies CSSProperties,
  conflictMessage: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", margin: "8px 0 0" } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
