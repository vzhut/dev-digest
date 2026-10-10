import type { CSSProperties } from "react";
import { EVAL_METRIC_COLOR } from "@/lib/eval-format";

export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "16px 20px",
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
    color: "inherit",
    textDecoration: "none",
  } satisfies CSSProperties,
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 8,
    display: "grid",
    placeItems: "center",
    background: "var(--accent-bg)",
    color: "var(--accent)",
    flexShrink: 0,
  } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  name: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  modelChip: {
    fontSize: 11.5,
    padding: "2px 8px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  subline: { fontSize: 13, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
  metrics: { display: "flex", gap: 32, alignItems: "center" } satisfies CSSProperties,
  metric: { textAlign: "center", minWidth: 56 } satisfies CSSProperties,
  metricLabel: { fontSize: 10.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" } satisfies CSSProperties,
  metricValue: (color: string): CSSProperties => ({ fontSize: 24, fontWeight: 600, color, letterSpacing: "-0.01em" }),
  chevron: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
};

export const METRIC_COLORS = EVAL_METRIC_COLOR;
