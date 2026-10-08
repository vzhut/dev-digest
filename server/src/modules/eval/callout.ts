import type { EvalMetricKey, EvalRegression, EvalSuiteRun } from '@devdigest/shared';
import { REGRESSION_DELTA } from './constants.js';

type Metrics = Pick<EvalSuiteRun, EvalMetricKey>;

export const EVAL_METRIC_KEYS: readonly EvalMetricKey[] = ['recall', 'precision', 'citation_accuracy'];

/** Round away float noise so a drop of exactly 0.05 (0.35 → 0.30 is 0.04999…) still counts. */
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Metrics on which `latest` is lower than `previous` by at least REGRESSION_DELTA (AC-40). A metric
 * that is null on either side has nothing to compare and is skipped.
 */
export function regressions(latest: Metrics, previous: Metrics): EvalRegression[] {
  const out: EvalRegression[] = [];
  for (const metric of EVAL_METRIC_KEYS) {
    const now = latest[metric];
    const before = previous[metric];
    if (now == null || before == null) continue;
    const drop = round(before - now);
    if (drop >= REGRESSION_DELTA) out.push({ metric, drop });
  }
  return out;
}
