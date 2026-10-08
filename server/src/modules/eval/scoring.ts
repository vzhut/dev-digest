import type {
  EvalCaseResult,
  EvalExpectation,
  EvalExpectationOutcome,
  Finding,
} from '@devdigest/shared';
import { EVAL_PATH_PREFIXES } from './constants.js';

/**
 * Eval scoring — pure and deterministic: no LLM, network, DB or clock. The same produced findings
 * and cases always give the same metrics (AC-27). Only grounded (kept) findings are ever scored;
 * findings the citation gate dropped only count towards citation accuracy.
 */

type Located = Pick<Finding, 'file' | 'start_line' | 'end_line'>;

/** Strip one leading `a/`, `b/` or `./` so diff-style and plain paths compare equal. */
export function normalizePath(path: string): string {
  for (const prefix of EVAL_PATH_PREFIXES) {
    if (path.startsWith(prefix)) return path.slice(prefix.length);
  }
  return path;
}

const lo = (a: number, b: number) => Math.min(a, b);
const hi = (a: number, b: number) => Math.max(a, b);

/** Same file after normalisation and overlapping closed line ranges (reversed ranges normalised). */
export function matches(finding: Located, expectation: EvalExpectation): boolean {
  if (normalizePath(finding.file) !== normalizePath(expectation.file)) return false;
  return (
    lo(finding.start_line, finding.end_line) <= hi(expectation.start_line, expectation.end_line) &&
    lo(expectation.start_line, expectation.end_line) <= hi(finding.start_line, finding.end_line)
  );
}

export interface ScoreCaseInput {
  caseId: string;
  caseName?: string | null;
  expectation: EvalExpectation;
  /** Findings that survived the grounding gate. */
  kept: Finding[];
  dropped: { finding: Finding; reason: string }[];
}

/** A case result before the executor adds cost and duration. */
export type ScoredCase = Omit<EvalCaseResult, 'cost_usd' | 'duration_ms'>;

/**
 * Score one case. `must_find` passes with at least one matching kept finding; `must_not_flag`
 * passes with none. A kept finding matching a `must_not_flag` is noise; one matching nothing is
 * unlabeled (reported, never penalised).
 */
export function scoreCase({ caseId, caseName, expectation, kept, dropped }: ScoreCaseInput): ScoredCase {
  const matchedBy: number[] = [];
  kept.forEach((finding, index) => {
    if (matches(finding, expectation)) matchedBy.push(index);
  });
  const matched = new Set(matchedBy);
  const noise = expectation.type === 'must_not_flag' ? matchedBy : [];
  const unlabeled = kept.map((_, index) => index).filter((index) => !matched.has(index));
  const passed = expectation.type === 'must_find' ? matchedBy.length > 0 : matchedBy.length === 0;
  return {
    case_id: caseId,
    case_name: caseName ?? null,
    status: passed ? 'passed' : 'failed',
    error: null,
    produced: kept,
    dropped,
    outcomes: [{ expectation, matched_by: matchedBy }],
    noise,
    unlabeled,
  };
}

/** A case whose agent call failed: status `error`, nothing produced, excluded from every metric. */
export function errorCaseOutcome(
  caseId: string,
  reason: string,
  extras: { caseName?: string | null; expectation?: EvalExpectation; durationMs?: number } = {},
): EvalCaseResult {
  const outcomes: EvalExpectationOutcome[] = extras.expectation
    ? [{ expectation: extras.expectation, matched_by: [] }]
    : [];
  return {
    case_id: caseId,
    case_name: extras.caseName ?? null,
    status: 'error',
    error: reason,
    produced: [],
    dropped: [],
    outcomes,
    noise: [],
    unlabeled: [],
    cost_usd: null,
    duration_ms: extras.durationMs ?? 0,
  };
}

export interface RunScore {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  traces_passed: number;
  traces_total: number;
  cases_errored: number;
  unlabeled: number;
  cost_usd: number | null;
  cost_partial: boolean;
}

const ratio = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : numerator / denominator;

/**
 * Aggregate case results into run metrics. Errored cases are excluded from every metric numerator
 * and denominator; a zero denominator gives `null`, never 0 or 1. `traces_total` counts every case
 * of the run (so "p / n" can show errored ones); `cost_usd` sums the known costs and
 * `cost_partial` flags that at least one was unknown.
 */
export function scoreRun(results: EvalCaseResult[]): RunScore {
  const scored = results.filter((r) => r.status !== 'error');
  let mustFind = 0;
  let mustFindMatched = 0;
  let kept = 0;
  let falsePositives = 0;
  let dropped = 0;
  let unlabeled = 0;
  for (const r of scored) {
    for (const o of r.outcomes) {
      if (o.expectation.type !== 'must_find') continue;
      mustFind += 1;
      if (o.matched_by.length > 0) mustFindMatched += 1;
    }
    kept += r.produced.length;
    falsePositives += r.noise.length;
    dropped += r.dropped.length;
    unlabeled += r.unlabeled.length;
  }
  let cost = 0;
  let knownCosts = 0;
  for (const r of results) {
    if (r.cost_usd == null) continue;
    cost += r.cost_usd;
    knownCosts += 1;
  }
  return {
    recall: ratio(mustFindMatched, mustFind),
    precision: ratio(kept - falsePositives, kept),
    citation_accuracy: ratio(kept, kept + dropped),
    traces_passed: results.filter((r) => r.status === 'passed').length,
    traces_total: results.length,
    cases_errored: results.length - scored.length,
    unlabeled,
    cost_usd: knownCosts === 0 ? null : cost,
    cost_partial: knownCosts < results.length,
  };
}
