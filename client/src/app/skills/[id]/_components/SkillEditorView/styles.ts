import type { CSSProperties } from "react";

/** Co-located styles for SkillEditorView. */
export const s = {
  loading: { padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  editor: { display: "flex", flexDirection: "column", minWidth: 0 } satisfies CSSProperties,
  editorHead: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, padding: "20px 28px 0" } satisfies CSSProperties,
  editorIcon: (fg: string, bg: string): CSSProperties => ({
    width: 34,
    height: 34,
    borderRadius: 9,
    background: bg,
    color: fg,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  }),
  editorTitle: { fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, minWidth: 0, wordBreak: "break-all" } satisfies CSSProperties,
  editorBody: { minHeight: 0 } satisfies CSSProperties,
};
