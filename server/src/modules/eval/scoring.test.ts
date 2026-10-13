import { describe, it, expect } from 'vitest';
import type { EvalCaseResult, EvalExpectation, Finding } from '@devdigest/shared';
import { errorCaseOutcome, matches, normalizePath, scoreCase, scoreRun } from './scoring.js';

const finding = (file: string, start: number, end = start, id = `${file}:${start}`): Finding => ({
  id,
  severity: 'WARNING',
  category: 'bug',
  title: 't',
  file,
  start_line: start,
  end_line: end,
  rationale: 'r',
  confidence: 0.9,
});
const mustFind = (file: string, start: number, end = start): EvalExpectation => ({
  type: 'must_find',
  file,
  start_line: start,
  end_line: end,
});
const mustNotFlag = (file: string, start: number, end = start): EvalExpectation => ({
  type: 'must_not_flag',
  file,
  start_line: start,
  end_line: end,
});
const withCost = (r: ReturnType<typeof scoreCase>, cost: number | null): EvalCaseResult => ({
  ...r,
  cost_usd: cost,
  duration_ms: 10,
});
const score = (
  id: string,
  expectation: EvalExpectation,
  kept: Finding[],
  dropped: Finding[] = [],
  cost: number | null = 0.01,
) =>
  withCost(
    scoreCase({
      caseId: id,
      expectation,
      kept,
      dropped: dropped.map((f) => ({ finding: f, reason: 'outside hunk' })),
    }),
    cost,
  );

describe('matches / normalizePath (AC-21)', () => {
  it('strips a/, b/ and ./ prefixes only', () => {
    expect(normalizePath('a/src/x.ts')).toBe('src/x.ts');
    expect(normalizePath('b/src/x.ts')).toBe('src/x.ts');
    expect(normalizePath('./src/x.ts')).toBe('src/x.ts');
    expect(normalizePath('src/a/x.ts')).toBe('src/a/x.ts');
  });

  it('matches overlapping, single-line, reversed and prefixed; rejects adjacent and other files', () => {
    const exp = mustFind('src/x.ts', 10, 20);
    expect(matches(finding('src/x.ts', 15, 30), exp)).toBe(true); // overlap
    expect(matches(finding('src/x.ts', 20, 25), exp)).toBe(true); // shares the closed end line
    expect(matches(finding('src/x.ts', 21, 25), exp)).toBe(false); // adjacent, not overlapping
    expect(matches(finding('src/x.ts', 9, 9), exp)).toBe(false);
    expect(matches(finding('src/x.ts', 12, 12), exp)).toBe(true); // single line inside
    expect(matches(finding('src/x.ts', 18, 5), exp)).toBe(true); // reversed finding range
    expect(matches(finding('src/x.ts', 5, 8), mustFind('src/x.ts', 20, 10))).toBe(false); // reversed expectation
    expect(matches(finding('src/x.ts', 15, 15), mustFind('src/x.ts', 20, 10))).toBe(true);
    expect(matches(finding('b/src/x.ts', 12), mustFind('./src/x.ts', 10, 20))).toBe(true);
    expect(matches(finding('src/y.ts', 15), exp)).toBe(false); // different file
  });
});

describe('scoreCase (AC-26)', () => {
  it('must_find passes with a match and fails without; must_not_flag is the inverse', () => {
    expect(score('c1', mustFind('a.ts', 5), [finding('a.ts', 5)]).status).toBe('passed');
    expect(score('c2', mustFind('a.ts', 5), [finding('a.ts', 50)]).status).toBe('failed');
    expect(score('c3', mustNotFlag('a.ts', 5), []).status).toBe('passed');
    expect(score('c4', mustNotFlag('a.ts', 5), [finding('a.ts', 5)]).status).toBe('failed');
  });

  it('labels noise and unlabeled findings by index', () => {
    const r = score('c', mustNotFlag('a.ts', 5), [finding('a.ts', 5), finding('a.ts', 90)]);
    expect(r.noise).toEqual([0]);
    expect(r.unlabeled).toEqual([1]);
    expect(r.outcomes[0]?.matched_by).toEqual([0]);
    const ok = score('d', mustFind('a.ts', 5), [finding('a.ts', 5), finding('a.ts', 90)]);
    expect(ok.noise).toEqual([]);
    expect(ok.unlabeled).toEqual([1]);
  });

  it('errorCaseOutcome is status error with the reason and no findings', () => {
    const r = errorCaseOutcome('c', 'provider down', { expectation: mustFind('a.ts', 1) });
    expect(r).toMatchObject({ status: 'error', error: 'provider down', produced: [], cost_usd: null });
    expect(r.outcomes).toHaveLength(1);
  });
});

describe('scoreRun', () => {
  it('recall is matched must_find / scored must_find (hand-computed 2/3)', () => {
    const run = scoreRun([
      score('1', mustFind('a.ts', 1), [finding('a.ts', 1)]),
      score('2', mustFind('b.ts', 1), [finding('b.ts', 99)]),
      score('3', mustFind('c.ts', 1), [finding('c.ts', 1)]),
      score('4', mustNotFlag('d.ts', 1), []),
    ]);
    expect(run.recall).toBeCloseTo(2 / 3, 10);
    expect(run.traces_passed).toBe(3);
    expect(run.traces_total).toBe(4);
  });

  it('precision counts a must_not_flag hit as a false positive; unlabeled is not penalised (AC-23)', () => {
    const run = scoreRun([
      score('1', mustNotFlag('a.ts', 1), [finding('a.ts', 1), finding('a.ts', 70), finding('a.ts', 80)]),
    ]);
    // kept = 3, FP = 1 (the hit), unlabeled = 2
    expect(run.precision).toBeCloseTo(2 / 3, 10);
    expect(run.unlabeled).toBe(2);
  });

  it('citation accuracy = kept / (kept + dropped) (AC-24)', () => {
    const run = scoreRun([score('1', mustFind('a.ts', 1), [finding('a.ts', 1)], [finding('z.ts', 3)])]);
    expect(run.citation_accuracy).toBeCloseTo(0.5, 10);
  });

  it('a silent agent on a must_not_flag-only set: every metric null, all cases pass (AC-25)', () => {
    const run = scoreRun([score('1', mustNotFlag('a.ts', 1), []), score('2', mustNotFlag('b.ts', 4), [])]);
    expect(run).toMatchObject({
      recall: null,
      precision: null,
      citation_accuracy: null,
      traces_passed: 2,
      traces_total: 2,
    });
  });

  it('errored cases are excluded from every numerator and denominator; all-errored gives all null', () => {
    const mixed = scoreRun([
      score('1', mustFind('a.ts', 1), [finding('a.ts', 1)]),
      errorCaseOutcome('2', 'boom', { expectation: mustFind('b.ts', 1) }),
    ]);
    expect(mixed.recall).toBe(1);
    expect(mixed.cases_errored).toBe(1);
    expect(mixed.traces_total).toBe(2);
    const all = scoreRun([errorCaseOutcome('1', 'x', { expectation: mustFind('a.ts', 1) })]);
    expect(all).toMatchObject({ recall: null, precision: null, citation_accuracy: null, cases_errored: 1 });
  });

  it('cost is the sum of known costs and flagged partial when any is unknown, never 0 (AC-29)', () => {
    const run = scoreRun([
      score('1', mustFind('a.ts', 1), [], [], 0.25),
      score('2', mustFind('a.ts', 1), [], [], null),
      score('3', mustFind('a.ts', 1), [], [], 0.5),
    ]);
    expect(run.cost_usd).toBeCloseTo(0.75, 10);
    expect(run.cost_partial).toBe(true);
    const none = scoreRun([score('1', mustFind('a.ts', 1), [], [], null)]);
    expect(none.cost_usd).toBeNull();
    expect(none.cost_partial).toBe(true);
    expect(scoreRun([score('1', mustFind('a.ts', 1), [], [], 0.1)]).cost_partial).toBe(false);
  });

  it('is deterministic and touches no LLM: twice over the same input is deep-equal (AC-27)', () => {
    // Scoring takes no provider, client or clock: the same input must give an identical result.
    const results = [
      score('1', mustFind('a.ts', 1), [finding('a.ts', 1), finding('a.ts', 9)], [finding('q.ts', 2)]),
      score('2', mustNotFlag('b.ts', 3), [finding('b.ts', 3)]),
    ];
    expect(scoreRun(results)).toEqual(scoreRun(results));
    expect(scoreCase({ caseId: 'x', expectation: mustFind('a.ts', 1), kept: [], dropped: [] })).toEqual(
      scoreCase({ caseId: 'x', expectation: mustFind('a.ts', 1), kept: [], dropped: [] }),
    );
  });

  it('scores 50 cases x 20 findings in under 50 ms', () => {
    const results = Array.from({ length: 50 }, (_, i) =>
      score(
        `c${i}`,
        i % 2 ? mustFind(`f${i}.ts`, 10, 20) : mustNotFlag(`f${i}.ts`, 10, 20),
        Array.from({ length: 20 }, (_, j) => finding(`f${i}.ts`, j * 3 + 1, j * 3 + 2)),
      ),
    );
    const started = performance.now();
    scoreRun(results);
    for (let i = 0; i < 50; i += 1) {
      scoreCase({
        caseId: `c${i}`,
        expectation: mustFind(`f${i}.ts`, 10, 20),
        kept: Array.from({ length: 20 }, (_, j) => finding(`f${i}.ts`, j * 3 + 1, j * 3 + 2)),
        dropped: [],
      });
    }
    expect(performance.now() - started).toBeLessThan(50);
  });
});
