/* Pure helpers behind the project-context checklist (agent/skill editors).
   No React, no network. Token numbers are the server's per-doc counts; the
   editor estimate is their exact sum (no budget, no truncation). */
import type { ContextDoc, ContextDocType } from "@devdigest/shared";

export interface ChecklistRow {
  path: string;
  type: ContextDocType | null;
  tokens: number | null;
  /** Checked = attached directly to this agent/skill (inherited rows are never checked). */
  attached: boolean;
  /** Attached but absent from the current listing. */
  missing: boolean;
  /** Listed path that fails ContextPath — shown but cannot be attached. */
  attachable: boolean;
  /** Set for rows that come from a skill; read-only. */
  inheritedFrom: string | null;
}

export interface InheritedContext {
  skill_id: string;
  skill_name: string;
  paths: string[];
}

const TYPE_ORDER: Record<ContextDocType, number> = { specs: 0, docs: 1, insights: 2, other: 3 };

// Mirrors the shared `ContextPath` rules. Not imported: the client never takes a
// runtime import from the @devdigest/shared barrel (webpack can't resolve its `.js` specifiers).
const FORBIDDEN_CHARS = /[\\"\u0000-\u001f\u007f]/;
export function isAttachable(path: string): boolean {
  return (
    path.length >= 1 &&
    path.length <= 512 &&
    path.endsWith(".md") &&
    !FORBIDDEN_CHARS.test(path) &&
    path.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..")
  );
}

/** Attached rows first (saved order), then listed docs by type/path, then inherited rows. */
export function buildChecklistRows(
  docs: ContextDoc[],
  attachedPaths: string[],
  inherited: InheritedContext[] = [],
): ChecklistRow[] {
  const byPath = new Map(docs.map((d) => [d.path, d]));
  const attachedSet = new Set(attachedPaths);

  const attachedRows: ChecklistRow[] = attachedPaths.map((path) => {
    const doc = byPath.get(path);
    return {
      path,
      type: doc?.type ?? null,
      tokens: doc?.tokens ?? null,
      attached: true,
      missing: !doc,
      attachable: true,
      inheritedFrom: null,
    };
  });

  const otherRows: ChecklistRow[] = docs
    .filter((d) => !attachedSet.has(d.path))
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.path.localeCompare(b.path))
    .map((d) => ({
      path: d.path,
      type: d.type,
      tokens: d.tokens,
      attached: false,
      missing: false,
      attachable: isAttachable(d.path),
      inheritedFrom: null,
    }));

  const inheritedRows: ChecklistRow[] = inherited.flatMap((group) =>
    group.paths.map((path) => {
      const doc = byPath.get(path);
      return {
        path,
        type: doc?.type ?? null,
        tokens: doc?.tokens ?? null,
        attached: false,
        missing: !doc,
        attachable: false,
        inheritedFrom: group.skill_name,
      };
    }),
  );

  return [...attachedRows, ...otherRows, ...inheritedRows];
}

/** Case-insensitive substring match on the full path. */
export function filterRows(rows: ChecklistRow[], query: string): ChecklistRow[] {
  const q = query.trim().toLowerCase();
  return q ? rows.filter((r) => r.path.toLowerCase().includes(q)) : rows;
}

/** Directly attached rows only — inherited rows are excluded. */
export function attachedCount(rows: ChecklistRow[]): number {
  return rows.filter((r) => r.attached && r.inheritedFrom === null).length;
}

/** Exact sum of the listed tokens of attached rows (missing rows have none). */
export function selectionTokens(rows: ChecklistRow[]): number {
  return rows.reduce((sum, r) => (r.attached && r.inheritedFrom === null ? sum + (r.tokens ?? 0) : sum), 0);
}

/** Moves the row at `index` by `delta` (-1 up / +1 down); out of range returns the input unchanged. */
export function moveRow<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return items;
  const next = items.slice();
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next;
}

/** Ordered paths to save: the attached rows, in row order. */
export function toPaths(rows: ChecklistRow[]): string[] {
  return rows.filter((r) => r.attached && r.inheritedFrom === null).map((r) => r.path);
}
