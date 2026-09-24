import type { Finding, IntentConfidence, Severity } from '@devdigest/shared';

/** A finding after the scope policy; `original_severity` is set only when downgraded. */
export type ScopedFinding = Finding & { original_severity?: Severity | null };

export interface ScopeStats {
  /** Findings the model tagged out_of_scope (whether or not downgraded). */
  tagged: number;
  downgraded: number;
  /** Out-of-scope findings left untouched because CRITICAL, security or bug. */
  kept: number;
}

/**
 * Categories whose findings are never downgraded for being out of scope: the scope claim
 * originates in author-written text, and a defect is a defect wherever it sits.
 */
const PROTECTED_CATEGORIES: ReadonlySet<Finding['category']> = new Set(['security', 'bug']);

/**
 * Scope policy — pure, deterministic. Tag + downgrade, NEVER drop:
 * - no intent, or low confidence → unchanged (`scope` kept as informational)
 * - out_of_scope + (CRITICAL | security | bug) → unchanged
 * - out_of_scope WARNING (perf / style / test) → SUGGESTION, `original_severity: 'WARNING'`
 * - out_of_scope SUGGESTION → tag only
 * Output length always equals input length.
 */
export function applyIntentScope(
  findings: readonly Finding[],
  intent: { confidence: IntentConfidence } | null | undefined,
): { findings: ScopedFinding[]; stats: ScopeStats } {
  const stats: ScopeStats = { tagged: 0, downgraded: 0, kept: 0 };
  const active = !!intent && intent.confidence !== 'low';
  const out = findings.map((f): ScopedFinding => {
    if (f.scope !== 'out_of_scope') return { ...f, original_severity: null };
    stats.tagged++;
    if (!active) return { ...f, original_severity: null };
    if (f.severity === 'CRITICAL' || PROTECTED_CATEGORIES.has(f.category)) {
      stats.kept++;
      return { ...f, original_severity: null };
    }
    if (f.severity === 'WARNING') {
      stats.downgraded++;
      return { ...f, severity: 'SUGGESTION', original_severity: 'WARNING' };
    }
    return { ...f, original_severity: null };
  });
  return { findings: out, stats };
}
