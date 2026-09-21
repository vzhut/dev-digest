import type { CSSProperties } from "react";
import type { TypeTint } from "./helpers";

/** Co-located styles for SkillCard. */
export const s = {
  card: (active: boolean, enabled: boolean): CSSProperties => ({
    padding: 14,
    borderRadius: 8,
    cursor: "pointer",
    border: "1px solid " + (active ? "var(--accent)" : "var(--border)"),
    background: active ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: enabled ? 1 : 0.55,
    marginBottom: 10,
  }),
  headerRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  iconBox: (tint: TypeTint): CSSProperties => ({
    width: 30,
    height: 30,
    borderRadius: 8,
    background: tint.bg,
    color: tint.fg,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  }),
  source: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  name: {
    fontFamily: "var(--font-mono)",
    fontSize: 14,
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  description: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    marginTop: 8,
    lineHeight: 1.4,
    display: "-webkit-box",
    WebkitLineClamp: 1,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap" } satisfies CSSProperties,
} as const;
