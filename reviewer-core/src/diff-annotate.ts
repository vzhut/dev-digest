/**
 * Annotate a unified diff's TEXT with real new-file line numbers, so a model
 * citing `start_line`/`end_line` can read the number off the diff instead of
 * counting lines of the pasted diff block itself (which includes the
 * `diff --git` / `---` / `+++` / `@@` header lines a model easily miscounts
 * as content — see reviewer-core/INSIGHTS.md, "diff line numbers are not
 * self-evident to a cheap model").
 *
 * Pure text transform, independent of the parsed `UnifiedDiff.hunks` — it
 * re-derives line numbers from the `@@ -a,b +c,d @@` headers already in the
 * text, the same headers `git diff` always emits. Grounding itself still
 * validates against `UnifiedDiff.hunks[].newLineNumbers`, not this text, so
 * annotating changes nothing about what is accepted — only what the model has
 * to read to get a citation right the first time.
 *
 * A left gutter of `<new-file line> ` precedes every context/added line; a
 * removed line (present only in the old file, never a valid citation target)
 * gets a blank gutter instead of a number. File-header and hunk-header lines
 * (`diff --git`, `---`, `+++`, `@@ …`) and non-diff lines (binary markers,
 * "\ No newline at end of file") pass through unnumbered.
 */

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const GUTTER_WIDTH = 5;

function gutter(n: number | null): string {
  return (n === null ? '' : String(n)).padStart(GUTTER_WIDTH) + (n === null ? '  ' : ' ');
}

export function annotateDiff(raw: string): string {
  if (!raw) return raw;
  const out: string[] = [];
  let newLine: number | null = null;

  for (const line of raw.split('\n')) {
    const hunkMatch = HUNK_HEADER.exec(line);
    if (hunkMatch) {
      newLine = Number(hunkMatch[2]);
      out.push(line);
      continue;
    }
    if (newLine === null) {
      // Before the first hunk of a file (diff --git / index / --- / +++), or a
      // non-hunk line (binary files differ, rename markers): pass through.
      out.push(line);
      continue;
    }
    if (line.startsWith('diff --git') || line.startsWith('--- ') || line.startsWith('+++ ')) {
      newLine = null; // next file: wait for its own @@ header
      out.push(line);
    } else if (line.startsWith('-')) {
      out.push(gutter(null) + line);
    } else if (line.startsWith('+')) {
      out.push(gutter(newLine) + line);
      newLine++;
    } else if (line.startsWith('\\')) {
      // "\ No newline at end of file" — not a content line, no counter change.
      out.push(gutter(null) + line);
    } else {
      // context line (leading space, or an empty line git renders with no prefix)
      out.push(gutter(newLine) + line);
      newLine++;
    }
  }
  return out.join('\n');
}
