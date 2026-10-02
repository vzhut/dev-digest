/** Lines of the SERIALIZES AS panel: the literal heading, then one labelled line per attached path, in order. */
export function serializedLines(paths: string[], label: (path: string) => string): string[] {
  // Protocol text, not UI copy: mirrors the heading reviewer-core emits in the prompt.
  return ["## Project context", ...paths.map(label)];
}

/** True when the draft differs from the saved paths (order matters). */
export function pathsChanged(draft: string[], saved: string[]): boolean {
  return draft.length !== saved.length || draft.some((p, i) => p !== saved[i]);
}
