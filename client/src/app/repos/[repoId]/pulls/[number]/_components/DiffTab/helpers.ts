import type { FindingRecord, PrFile, ReviewRecord, SmartDiff, SmartDiffRole } from "@devdigest/shared";
import { topSeverity } from "@/components/diff-viewer";
import { SMART_ROLE_ORDER } from "./constants";

export interface FileGroup {
  role: SmartDiffRole;
  files: PrFile[];
}

/** Map the smart-diff response onto the PR's own files. Unknown response paths
    are ignored; PR files the response doesn't mention are appended to `core`.
    Groups come back in display order, empty groups omitted. */
export function groupFiles(smart: SmartDiff, files: PrFile[]): FileGroup[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const placed = new Set<string>();
  const byRole = new Map<SmartDiffRole, PrFile[]>();

  for (const g of smart.groups) {
    for (const sf of g.files) {
      const file = byPath.get(sf.path);
      if (!file || placed.has(sf.path)) continue;
      placed.add(sf.path);
      byRole.set(g.role, [...(byRole.get(g.role) ?? []), file]);
    }
  }
  const missing = files.filter((f) => !placed.has(f.path));
  if (missing.length > 0) byRole.set("core", [...(byRole.get("core") ?? []), ...missing]);

  return SMART_ROLE_ORDER.flatMap((role) => {
    const list = byRole.get(role);
    return list && list.length > 0 ? [{ role, files: list }] : [];
  });
}

/** Findings of the latest review: the first `kind === 'review'` entry of the
    newest-first list (summary reviews ignored). Same rule as the server. */
export function latestReviewFindings(reviews: ReviewRecord[]): FindingRecord[] {
  return reviews.find((r) => r.kind === "review")?.findings ?? [];
}

/** Whether any review of kind 'review' exists (summary reviews do not count). */
export function hasReview(reviews: ReviewRecord[]): boolean {
  return reviews.some((r) => r.kind === "review");
}

/** Number of the given files that have at least one finding. */
export function filesWithFindings(
  files: PrFile[],
  byFile: Record<string, FindingRecord[]>,
): number {
  return files.filter((f) => (byFile[f.path]?.length ?? 0) > 0).length;
}

/** Group findings by file path, keeping their order. */
export function findingsByFile(findings: FindingRecord[]): Record<string, FindingRecord[]> {
  const out: Record<string, FindingRecord[]> = {};
  for (const f of findings) (out[f.file] ??= []).push(f);
  return out;
}

/** Highest severity among the findings of the given files; undefined when none. */
export function topSeverityOfFiles(
  files: PrFile[],
  byFile: Record<string, FindingRecord[]>,
): string | undefined {
  const all = files.flatMap((f) => byFile[f.path] ?? []);
  return all.length > 0 ? topSeverity(all) : undefined;
}
