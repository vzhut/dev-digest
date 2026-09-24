/**
 * Compact relative time (e.g. "3h", "2d") — used by the PR list's UPDATED
 * column and the Conventions page's "last scan" line. `now` is injectable so
 * the function is pure and testable; every caller renders client-side only,
 * so reading the clock here can't desync from SSR output.
 */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const m = Math.max(0, Math.round((now - then) / 60_000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
