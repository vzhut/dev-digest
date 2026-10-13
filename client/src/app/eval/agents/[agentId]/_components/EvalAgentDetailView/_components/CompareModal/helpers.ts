import type { EvalLineDiff } from "@devdigest/shared";

export type DiffRow = { kind: "line"; op: EvalLineDiff["op"]; text: string } | { kind: "gap"; count: number };

/** Unchanged lines kept on each side of a change. */
export const DIFF_CONTEXT_LINES = 3;

/** True when the diff has at least one added or removed line. */
export function hasChanges(lines: EvalLineDiff[]): boolean {
  return lines.some((l) => l.op !== "same");
}

/**
 * Rows to render: every added/removed line, DIFF_CONTEXT_LINES of context around each change, and a
 * `gap` row ("… N unchanged lines") for each longer unchanged run. An identical pair has no changes,
 * so it yields no rows (the caller shows "No prompt changes").
 */
export function collapseDiff(lines: EvalLineDiff[], context = DIFF_CONTEXT_LINES): DiffRow[] {
  if (!hasChanges(lines)) return [];
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (l.op === "same") return;
    for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j += 1) keep[j] = true;
  });
  const rows: DiffRow[] = [];
  let skipped = 0;
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (skipped > 0) rows.push({ kind: "gap", count: skipped });
      skipped = 0;
      rows.push({ kind: "line", op: l.op, text: l.text });
    } else {
      skipped += 1;
    }
  });
  if (skipped > 0) rows.push({ kind: "gap", count: skipped });
  return rows;
}
