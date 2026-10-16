import type { CSSProperties } from "react";
import { COLUMN_MIN_WIDTH, MAX_FIT_COLUMNS, SCROLL_COLUMN_MIN_WIDTH } from "../../constants";

export const s = {
  wrap: { padding: "20px 28px 22px" } satisfies CSSProperties,
  grid: (count: number): CSSProperties => {
    const scrolls = count > MAX_FIT_COLUMNS;
    const min = scrolls ? SCROLL_COLUMN_MIN_WIDTH : COLUMN_MIN_WIDTH;
    return {
      display: "grid",
      gridTemplateColumns: `repeat(${count}, minmax(${min}px, 1fr))`,
      gap: 12,
      alignItems: "stretch",
      overflowX: scrolls ? "auto" : "visible",
    };
  },
} as const;
