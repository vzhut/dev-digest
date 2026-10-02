/* Row-state transitions for ContextChecklist. Pure; the token/count math and
   row building live in `@/lib/context-docs`. */
import { moveRow, type ChecklistRow } from "@/lib/context-docs";

const isDirect = (r: ChecklistRow) => r.attached && r.inheritedFrom === null;

/** Ticking appends the doc to the end of the attached block; unticking a missing row removes it. */
export function toggleRow(rows: ChecklistRow[], path: string): ChecklistRow[] {
  const index = rows.findIndex((r) => r.path === path && r.inheritedFrom === null);
  const row = rows[index];
  if (!row || !row.attachable) return rows;
  if (row.attached) {
    if (row.missing) return rows.filter((_, i) => i !== index);
    return rows.map((r, i) => (i === index ? { ...r, attached: false } : r));
  }
  const rest = rows.filter((_, i) => i !== index);
  const lastAttached = rest.reduce((last, r, i) => (isDirect(r) ? i : last), -1);
  return [...rest.slice(0, lastAttached + 1), { ...row, attached: true }, ...rest.slice(lastAttached + 1)];
}

/** Whether the attached row at `index` has an attached neighbour in that direction. */
export function canMove(rows: ChecklistRow[], index: number, delta: -1 | 1): boolean {
  const row = rows[index];
  const neighbour = rows[index + delta];
  return !!row && isDirect(row) && !!neighbour && isDirect(neighbour);
}

export function moveAttached(rows: ChecklistRow[], index: number, delta: -1 | 1): ChecklistRow[] {
  return canMove(rows, index, delta) ? moveRow(rows, index, delta) : rows;
}
