import { describe, it, expect } from 'vitest';
import { regressions } from './callout.js';

const m = (recall: number | null, precision: number | null, citation_accuracy: number | null) => ({
  recall,
  precision,
  citation_accuracy,
});

describe('regressions (AC-40)', () => {
  it('flags a precision drop of 0.06 and not one of 0.04', () => {
    expect(regressions(m(0.8, 0.74, 1), m(0.8, 0.8, 1))).toEqual([{ metric: 'precision', drop: 0.06 }]);
    expect(regressions(m(0.8, 0.76, 1), m(0.8, 0.8, 1))).toEqual([]);
  });

  it('counts a drop of exactly 0.05 despite float noise, and ignores improvements', () => {
    expect(regressions(m(0.3, 1, 1), m(0.35, 0.5, 0.9))).toEqual([{ metric: 'recall', drop: 0.05 }]);
  });

  it('skips a metric that is null on either side and reports every dropping metric', () => {
    expect(regressions(m(null, 0.5, 0.5), m(0.9, null, 0.9))).toEqual([{ metric: 'citation_accuracy', drop: 0.4 }]);
    expect(regressions(m(0.5, 0.5, 0.5), m(0.9, 0.9, 0.9)).map((r) => r.metric)).toEqual([
      'recall',
      'precision',
      'citation_accuracy',
    ]);
  });
});
