import type { CSSProperties } from "react";
import { POPOVER_WIDTH } from "./constants";
import type { PopoverPosition } from "./helpers";

/** Co-located styles for FindingsPopover + FindingPreviewItem. */
export const s = {
  trigger: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "2px 0",
    background: "none",
    border: "none",
    font: "inherit",
    cursor: "default",
  } satisfies CSSProperties,
  /** Dotted underline = "hover me" affordance. */
  triggerItem: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    color,
    fontSize: 12,
    fontWeight: 600,
    borderBottom: `1px dotted ${color}`,
    paddingBottom: 1,
  }),
  /** `pos` is null for the hidden measuring pass (natural height, off-screen). */
  popover: (pos: PopoverPosition | null): CSSProperties => ({
    position: "fixed",
    left: pos?.left ?? 0,
    top: pos?.top ?? 0,
    visibility: pos ? "visible" : "hidden",
    zIndex: 1000,
    width: POPOVER_WIDTH,
    maxWidth: "calc(100vw - 16px)",
    // Set only when taller than the viewport; otherwise the whole popover shows.
    maxHeight: pos?.maxHeight,
    overflowY: pos?.maxHeight ? "auto" : "visible",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    boxShadow: "0 12px 32px rgba(0,0,0,.35)",
    cursor: "default",
    textAlign: "left",
  }),
  header: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "10px 14px 8px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  list: { padding: "0 14px 6px" } satisfies CSSProperties,
  item: {
    padding: "8px 0 10px",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  /** Icon stays pinned left; title + category flow and wrap as one text block. */
  itemTitleRow: { display: "flex", alignItems: "flex-start", gap: 8 } satisfies CSSProperties,
  itemTitleText: { flex: 1, minWidth: 0, lineHeight: 1.4 } satisfies CSSProperties,
  itemCategory: { display: "inline-flex", marginLeft: 8, verticalAlign: "middle" } satisfies CSSProperties,
  itemSeverity: (color: string, bg: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
    padding: "2px 5px",
    borderRadius: 5,
    color,
    background: bg,
  }),
  itemTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  itemMeta: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: 10,
    rowGap: 2,
    marginTop: 4,
  } satisfies CSSProperties,
  /** Long repo paths wrap anywhere instead of forcing a horizontal scrollbar. */
  itemFile: { fontSize: 11.5, color: "var(--accent-text)", overflowWrap: "anywhere", minWidth: 0 } satisfies CSSProperties,
  itemSummary: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 1.45,
    color: "var(--text-secondary)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
} as const;
