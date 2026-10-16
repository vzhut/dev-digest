import type { CSSProperties } from "react";

type DotState = "done" | "current" | "todo";

export const s = {
  list: { display: "flex", alignItems: "center", listStyle: "none", margin: 0, padding: "0 5px" } satisfies CSSProperties,
  item: (hasNext: boolean): CSSProperties => ({ display: "flex", alignItems: "center", gap: 10, flex: hasNext ? 1 : undefined }),
  dot: (state: DotState): CSSProperties => ({
    width: 24,
    height: 24,
    borderRadius: 99,
    display: "grid",
    placeItems: "center",
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
    background: state === "done" ? "var(--ok)" : state === "current" ? "var(--accent)" : "var(--bg-elevated)",
    color: state === "todo" ? "var(--text-muted)" : "#fff",
    border: state === "todo" ? "1px solid var(--border-strong)" : "none",
  }),
  label: (reached: boolean, current: boolean): CSSProperties => ({
    fontSize: 13,
    fontWeight: current ? 600 : 500,
    color: reached ? "var(--text-primary)" : "var(--text-muted)",
    whiteSpace: "nowrap",
  }),
  line: (done: boolean): CSSProperties => ({
    flex: 1,
    height: 1,
    minWidth: 24,
    background: done ? "var(--ok)" : "var(--border-strong)",
    margin: "0 14px",
  }),
} as const;
