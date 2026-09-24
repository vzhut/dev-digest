import type { CSSProperties } from "react";

const LINE_HEIGHT = 20;
const FONT = { fontSize: 13, lineHeight: `${LINE_HEIGHT}px` } as const;

/** Co-located styles for SkillBodyEditor. */
export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  fileName: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  tokens: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  area: { display: "flex", maxHeight: 420, minHeight: 200, position: "relative" } satisfies CSSProperties,
  gutter: {
    ...FONT,
    padding: "12px 10px 12px 14px",
    textAlign: "right",
    color: "var(--text-muted)",
    userSelect: "none",
    overflow: "hidden",
    whiteSpace: "pre",
    minWidth: 44,
  } satisfies CSSProperties,
  textarea: {
    ...FONT,
    flex: 1,
    padding: "12px 14px 12px 6px",
    border: 0,
    outline: 0,
    resize: "none",
    background: "transparent",
    color: "var(--text-primary)",
    whiteSpace: "pre",
    overflow: "auto",
  } satisfies CSSProperties,
} as const;
