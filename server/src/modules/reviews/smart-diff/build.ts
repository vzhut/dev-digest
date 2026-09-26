/**
 * Smart Diff assembly. Pure: plain inputs in, `SmartDiff` out (no rows, no DB).
 */
import type { SmartDiff, SmartDiffFile, SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from './classify.js';
import { SMART_DIFF_ROLE_ORDER } from './constants.js';

export interface SmartDiffFileInput {
  path: string;
  additions: number;
  deletions: number;
}

export interface SmartDiffFindingInput {
  file: string;
  start_line: number;
}

export interface SmartDiffReviewInput {
  kind: string;
  findings: SmartDiffFindingInput[];
}

/**
 * Findings of the latest review: the FIRST `kind === 'review'` entry of a
 * newest-first list (summary-kind reviews are ignored). Dismissed findings are
 * kept. No such review -> [].
 */
export function latestReviewFindings(reviews: SmartDiffReviewInput[]): SmartDiffFindingInput[] {
  const latest = reviews.find((r) => r.kind === 'review');
  return latest ? latest.findings : [];
}

/** Group files by role (fixed order, empty groups omitted, files sorted by path). */
export function buildSmartDiff(
  files: SmartDiffFileInput[],
  findings: SmartDiffFindingInput[],
): SmartDiff {
  const linesByFile = new Map<string, Set<number>>();
  for (const f of findings) {
    const set = linesByFile.get(f.file) ?? new Set<number>();
    set.add(f.start_line);
    linesByFile.set(f.file, set);
  }

  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>();
  let totalLines = 0;
  for (const f of files) {
    totalLines += f.additions + f.deletions;
    const role = classifyFile(f.path);
    const list = byRole.get(role) ?? [];
    list.push({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      finding_lines: [...(linesByFile.get(f.path) ?? [])].sort((a, b) => a - b),
    });
    byRole.set(role, list);
  }

  const groups = SMART_DIFF_ROLE_ORDER.flatMap((role) => {
    const list = byRole.get(role);
    if (!list?.length) return [];
    return [{ role, files: list.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) }];
  });

  return {
    groups,
    split_suggestion: { too_big: false, total_lines: totalLines, proposed_splits: [] },
  };
}
