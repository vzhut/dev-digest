import type { SkillStats } from "@devdigest/shared";

/** Accept rate as a percentage; null (nothing accepted/dismissed) is unknown — never "0%". */
export function formatAcceptRate(rate: number | null | undefined): string | null {
  if (rate == null || !Number.isFinite(rate)) return null;
  return `${Math.round(rate * 100)}%`;
}

/** No run has carried this skill yet — show the empty state, never zeros. */
export function hasNoRuns(stats: SkillStats): boolean {
  return stats.runs_30d === 0 && stats.findings_30d === 0;
}

export function maxCategoryCount(cats: SkillStats["findings_by_category"]): number {
  return Math.max(1, ...cats.map((c) => c.count));
}

/** Palette cycled across category segments in the donut. */
export const CATEGORY_COLORS = [
  "var(--crit)",
  "var(--warn)",
  "var(--accent)",
  "var(--info)",
  "var(--ok)",
  "var(--sugg)",
];

export function categorySegments(cats: SkillStats["findings_by_category"]) {
  return cats.map((c, i) => ({
    label: c.category,
    value: c.count,
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] ?? "var(--accent)",
  }));
}
