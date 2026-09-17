import { inArray } from 'drizzle-orm';
import {
  FINDING_PREVIEW_SUMMARY_MAX,
  type FindingCategory,
  type FindingPreview,
  type Severity,
} from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/** Cut a rationale to the preview length, marking the cut with an ellipsis. */
export function previewSummary(rationale: string): string {
  return rationale.length > FINDING_PREVIEW_SUMMARY_MAX
    ? `${rationale.slice(0, FINDING_PREVIEW_SUMMARY_MAX).trimEnd()}…`
    : rationale;
}

/**
 * Read-only finding previews for a set of reviews, grouped by review id — the
 * data behind the "N findings in this run" popover (PR list + PR timeline).
 * One IN-query however many reviews are asked for; every requested review gets
 * an entry, so "reviewed, found nothing" reads as [] rather than missing.
 * Order: CRITICAL → WARNING → SUGGESTION, then file, then start line.
 */
export async function findingPreviewsByReview(
  db: Db,
  reviewIds: string[],
): Promise<Map<string, FindingPreview[]>> {
  const byReview = new Map<string, FindingPreview[]>(reviewIds.map((id) => [id, []]));
  if (reviewIds.length === 0) return byReview;

  const rows = await db
    .select({
      id: t.findings.id,
      reviewId: t.findings.reviewId,
      severity: t.findings.severity,
      category: t.findings.category,
      title: t.findings.title,
      file: t.findings.file,
      startLine: t.findings.startLine,
      endLine: t.findings.endLine,
      confidence: t.findings.confidence,
      rationale: t.findings.rationale,
    })
    .from(t.findings)
    .where(inArray(t.findings.reviewId, reviewIds));

  rows.sort(
    (a, b) =>
      (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
      a.file.localeCompare(b.file) ||
      a.startLine - b.startLine,
  );
  for (const r of rows) {
    byReview.get(r.reviewId)?.push({
      id: r.id,
      severity: r.severity as Severity,
      category: r.category as FindingCategory,
      title: r.title,
      file: r.file,
      start_line: r.startLine,
      end_line: r.endLine,
      confidence: r.confidence,
      summary: previewSummary(r.rationale),
    });
  }
  return byReview;
}
