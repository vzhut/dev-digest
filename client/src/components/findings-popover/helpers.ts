import type { FindingPreview } from "@devdigest/shared";

/** `src/a.ts:12` for a single line, `src/a.ts:12-15` for a range. */
export function fileLineLabel(f: Pick<FindingPreview, "file" | "start_line" | "end_line">): string {
  const lines = f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
  return `${f.file}:${lines}`;
}

/** `maxHeight` is set only when the popover can't fit the viewport at all. */
export type PopoverPosition = { left: number; top: number; maxHeight?: number };

export const VIEWPORT_MARGIN = 8;

/**
 * Where to put a fixed-position popover of a MEASURED height so all of it is
 * visible: below the trigger if it fits, else above, else shifted to fit
 * anywhere in the viewport. Only a popover taller than the viewport itself gets
 * a `maxHeight` (and scrolls). Horizontally aligned to the trigger, clamped.
 */
export function popoverPosition(
  trigger: { left: number; top: number; bottom: number },
  viewport: { width: number; height: number },
  popover: { width: number; height: number; gap: number },
): PopoverPosition {
  const m = VIEWPORT_MARGIN;
  const left = Math.max(m, Math.min(trigger.left, viewport.width - popover.width - m));
  const { height, gap } = popover;

  if (trigger.bottom + gap + height <= viewport.height - m) return { left, top: trigger.bottom + gap };
  if (trigger.top - gap - height >= m) return { left, top: trigger.top - gap - height };
  if (height <= viewport.height - 2 * m) return { left, top: viewport.height - m - height };
  return { left, top: m, maxHeight: viewport.height - 2 * m };
}
