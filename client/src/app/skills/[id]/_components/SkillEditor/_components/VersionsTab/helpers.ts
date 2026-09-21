export interface DiffLine {
  kind: "same" | "add" | "del";
  text: string;
}

/** Simple line diff (LCS table) from `oldText` to `newText`. */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const w = b.length + 1;
  // Flat LCS table: lcs[i * w + j] = LCS length of a[i..] and b[j..].
  const lcs = new Array<number>((a.length + 1) * w).fill(0);
  const at = (i: number, j: number) => lcs[i * w + j] ?? 0;
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * w + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] ?? "" });
      i++;
      j++;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      out.push({ kind: "del", text: a[i++] ?? "" });
    } else {
      out.push({ kind: "add", text: b[j++] ?? "" });
    }
  }
  while (i < a.length) out.push({ kind: "del", text: a[i++] ?? "" });
  while (j < b.length) out.push({ kind: "add", text: b[j++] ?? "" });
  return out;
}

export function hasChanges(lines: DiffLine[]): boolean {
  return lines.some((l) => l.kind !== "same");
}
