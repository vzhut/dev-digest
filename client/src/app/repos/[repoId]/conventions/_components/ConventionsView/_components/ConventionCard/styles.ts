import type { CSSProperties } from "react";

export const s = {
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  collapsedRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 4px",
  } satisfies CSSProperties,
  collapsedRule: {
    flex: 1,
    fontSize: 13,
    color: "var(--text-muted)",
    textDecoration: "line-through",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  titleRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
  } satisfies CSSProperties,
  rule: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: 600,
    color: "var(--text-primary)",
    lineHeight: 1.4,
  } satisfies CSSProperties,
  editedChip: {
    flexShrink: 0,
    marginTop: 2,
  } satisfies CSSProperties,
  evidenceRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "10px 12px",
    borderRadius: 6,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    fontSize: 12.5,
    lineHeight: 1.5,
    overflowX: "auto",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  confidenceRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  confidenceBarWrap: {
    flex: 1,
    maxWidth: 160,
  } satisfies CSSProperties,
  confidencePct: {
    fontSize: 12,
    fontWeight: 600,
  } satisfies CSSProperties,
  actionsRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
} as const;
