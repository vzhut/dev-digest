import { describe, it, expect } from 'vitest';
import type { EvalCaseResult, EvalSuiteRunDetail } from '@devdigest/shared';
import { compareRuns, lineDiff } from './prompt-diff.js';

const result = (case_id: string, status: EvalCaseResult['status']): EvalCaseResult => ({
  case_id,
  case_name: `name-${case_id}`,
  status,
  produced: [],
  dropped: [],
  outcomes: [],
  noise: [],
  unlabeled: [],
  cost_usd: null,
  duration_ms: 1,
});

const run = (over: Partial<EvalSuiteRunDetail> & { id: string; ran_at: string }): EvalSuiteRunDetail => ({
  agent_id: 'agent',
  agent_version: 1,
  status: 'completed',
  finished_at: over.ran_at,
  cases_done: 2,
  traces_passed: 1,
  traces_total: 2,
  cases_errored: 0,
  unlabeled: 0,
  recall: 0.5,
  precision: 0.8,
  citation_accuracy: 1,
  cost_usd: 0.1,
  cost_partial: false,
  duration_ms: 1000,
  provider: 'openrouter',
  model: 'm',
  system_prompt: 'You review code.\nBe terse.',
  strategy: 'single-pass',
  skills: [],
  case_ids: ['c1', 'c2'],
  results: [result('c1', 'passed'), result('c2', 'failed')],
  ...over,
});

describe('lineDiff', () => {
  it('marks added and removed lines and keeps unchanged ones', () => {
    expect(lineDiff('a\nb\nc', 'a\nB\nc\nd')).toEqual([
      { op: 'same', text: 'a' },
      { op: 'del', text: 'b' },
      { op: 'add', text: 'B' },
      { op: 'same', text: 'c' },
      { op: 'add', text: 'd' },
    ]);
  });

  it('identical text is all same; empty to text is all add', () => {
    expect(lineDiff('x\ny', 'x\ny').every((l) => l.op === 'same')).toBe(true);
    expect(lineDiff('', 'x').map((l) => l.op)).toEqual(['del', 'add']);
  });
});

describe('compareRuns', () => {
  const earlier = run({ id: 'r1', ran_at: '2026-10-08T09:00:00.000Z' });
  const later = run({
    id: 'r2',
    ran_at: '2026-10-08T10:00:00.000Z',
    system_prompt: 'You review code.\nFlag everything.',
    precision: 0.5,
    recall: null,
    model: 'm2',
    skills: [{ id: 's1', name: 'sec', version: 2 }],
    case_ids: ['c2', 'c3'],
    results: [result('c2', 'passed'), result('c3', 'passed')],
    traces_passed: 2,
    cost_usd: 0.3,
    cost_partial: true,
  });

  it('older run is "old" whatever the selection order (AC-31)', () => {
    const a = compareRuns(later, earlier);
    const b = compareRuns(earlier, later);
    expect(a.old.id).toBe('r1');
    expect(a.new.id).toBe('r2');
    expect(b).toEqual(a);
  });

  it('computes null-safe signed deltas, cost, passed, flipped cases and config differences', () => {
    const c = compareRuns(earlier, later);
    expect(c.metrics.find((m) => m.metric === 'precision')).toMatchObject({ old: 0.8, new: 0.5 });
    expect(c.metrics.find((m) => m.metric === 'precision')?.delta).toBeCloseTo(-0.3, 10);
    expect(c.metrics.find((m) => m.metric === 'recall')).toEqual({ metric: 'recall', old: 0.5, new: null, delta: null });
    expect(c.cost).toEqual({ old: 0.1, new: 0.3, partial: true });
    expect(c.passed).toEqual({ old: { passed: 1, total: 2 }, new: { passed: 2, total: 2 } });
    expect(c.flipped_cases).toEqual([{ case_id: 'c2', case_name: 'name-c2', old: 'failed', new: 'passed' }]);
    expect(c.config_diff.model).toEqual({ old: 'm', new: 'm2' });
    expect(c.config_diff.provider).toBeNull();
    expect(c.config_diff.skills).toEqual({ old: [], new: ['s1@2'] });
    expect(c.same_config).toBe(false);
    expect(c.prompt_diff.filter((l) => l.op !== 'same')).toEqual([
      { op: 'del', text: 'Be terse.' },
      { op: 'add', text: 'Flag everything.' },
    ]);
  });

  it('counts common, added and removed cases and flags identical configs', () => {
    expect(compareRuns(earlier, later).case_set).toEqual({ common: 1, added: 1, removed: 1 });
    const twin = run({ id: 'r3', ran_at: '2026-10-08T11:00:00.000Z' });
    expect(compareRuns(earlier, twin)).toMatchObject({ same_config: true, case_set: { common: 2, added: 0, removed: 0 } });
  });
});
