/** Confidence-bar color thresholds (§5): green ≥ 0.8, amber ≥ 0.6, else muted. */
export function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return "var(--ok)";
  if (confidence >= 0.6) return "var(--warn)";
  return "var(--text-muted)";
}

export function confidencePct(confidence: number): number {
  return Math.round(confidence * 100);
}

/** `path:line` for a single-line span, `path:start-end` otherwise. */
export function formatLocation(path: string, lineStart: number, lineEnd: number): string {
  return lineStart === lineEnd ? `${path}:${lineStart}` : `${path}:${lineStart}-${lineEnd}`;
}
