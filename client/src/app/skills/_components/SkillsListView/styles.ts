import type { CSSProperties } from "react";
import { DETAIL_MIN_WIDTH, LIST_COL_WIDTH } from "./constants";

/** Co-located styles for SkillsListView. */
export const s = {
  layout: { display: "flex", flexWrap: "wrap", alignItems: "flex-start", minHeight: "calc(100vh - 52px)" } satisfies CSSProperties,
  list: {
    flex: `1 1 320px`,
    maxWidth: LIST_COL_WIDTH,
    minWidth: 0,
    padding: 20,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h1: { fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", flex: 1 } satisfies CSSProperties,
  addChevron: { marginLeft: 2 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  cards: { maxHeight: "calc(100vh - 190px)", overflowY: "auto", paddingRight: 2 } satisfies CSSProperties,
  detail: { flex: `999 1 ${DETAIL_MIN_WIDTH}px`, minWidth: 0, display: "flex", flexDirection: "column" } satisfies CSSProperties,
  detailEmpty: { padding: 40 } satisfies CSSProperties,
} as const;
