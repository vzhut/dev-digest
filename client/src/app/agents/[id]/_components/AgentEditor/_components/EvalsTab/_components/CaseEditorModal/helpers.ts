/**
 * Pure helpers of the case editor: read the files and hunks out of the diff text and validate the form
 * the way the server will (the server stays authoritative and answers 422 with a code).
 */

export interface DiffFile {
  path: string;
  /** Closed new-side line ranges of the file's hunks, from the `@@ -a,b +c,d @@` headers. */
  ranges: [number, number][];
}

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/** Files and hunk ranges of a unified diff (with or without `diff --git` lines). */
export function parseDiffFiles(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git")) {
      current = null;
      continue;
    }
    if (line.startsWith("+++ ")) {
      const path = line.slice(4).replace(/^b\//, "").trim();
      current = { path, ranges: [] };
      if (path && path !== "/dev/null") files.push(current);
      continue;
    }
    const m = HUNK.exec(line);
    if (m && current) {
      const start = Number(m[1]);
      const count = m[2] === undefined ? 1 : Number(m[2]);
      current.ranges.push([start, start + Math.max(count, 1) - 1]);
    }
  }
  return files;
}

export interface CaseForm {
  name: string;
  diff: string;
  type: "must_find" | "must_not_flag";
  file: string;
  startLine: string;
  endLine: string;
  title: string;
  prTitle: string;
  prBody: string;
}

export type FormError = "nameRequired" | "diffRequired" | "diffNoFiles" | "fileRequired" | "fileNotInDiff" | "lineRange" | "outsideHunks";

/** Reasons the form cannot be saved yet (empty when valid). Mirrors the server's checks. */
export function validateCase(f: CaseForm): FormError[] {
  const errors: FormError[] = [];
  if (!f.name.trim()) errors.push("nameRequired");
  const files = parseDiffFiles(f.diff);
  if (!f.diff.trim()) errors.push("diffRequired");
  else if (files.length === 0 || files.every((x) => x.ranges.length === 0)) errors.push("diffNoFiles");
  const start = Number(f.startLine);
  const end = Number(f.endLine);
  const rangeOk = Number.isInteger(start) && Number.isInteger(end) && start >= 1 && end >= start;
  if (!rangeOk) errors.push("lineRange");
  if (!f.file.trim()) errors.push("fileRequired");
  else if (files.length > 0) {
    const file = files.find((x) => x.path === f.file.trim());
    if (!file) errors.push("fileNotInDiff");
    else if (rangeOk && !file.ranges.some(([a, b]) => start <= b && end >= a)) errors.push("outsideHunks");
  }
  return errors;
}

/** The request body for the server, from a valid form. */
export function toWriteBody(f: CaseForm, born: boolean) {
  return {
    name: f.name.trim(),
    input_diff: f.diff,
    expectation: {
      type: f.type,
      file: f.file.trim(),
      start_line: Number(f.startLine),
      end_line: Number(f.endLine),
      ...(f.title.trim() ? { title: f.title.trim() } : {}),
    },
    ...(born ? {} : { pr_title: f.prTitle.trim() || undefined, pr_body: f.prBody || undefined }),
  };
}
