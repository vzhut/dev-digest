import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { applyIntentScope } from '../src/index.js';

const f = (over: Partial<Finding>): Finding => ({
  id: 'f',
  severity: 'WARNING',
  category: 'style',
  title: 't',
  file: 'a.ts',
  start_line: 1,
  end_line: 1,
  rationale: 'r',
  confidence: 0.9,
  kind: 'finding',
  scope: 'out_of_scope',
  ...over,
});

const medium = { confidence: 'medium' as const };

describe('applyIntentScope', () => {
  it('downgrades an out-of-scope WARNING to SUGGESTION with original_severity', () => {
    const { findings, stats } = applyIntentScope([f({})], medium);
    expect(findings[0]).toMatchObject({ severity: 'SUGGESTION', original_severity: 'WARNING', scope: 'out_of_scope' });
    expect(stats).toEqual({ tagged: 1, downgraded: 1, kept: 0 });
  });

  it('never touches CRITICAL, security or bug findings (the one signal)', () => {
    const { findings, stats } = applyIntentScope(
      [
        f({ severity: 'CRITICAL', category: 'style' }),
        f({ severity: 'WARNING', category: 'security' }),
        f({ severity: 'WARNING', category: 'bug' }),
      ],
      medium,
    );
    expect(findings.map((x) => x.severity)).toEqual(['CRITICAL', 'WARNING', 'WARNING']);
    expect(findings.every((x) => x.original_severity == null)).toBe(true);
    expect(stats).toEqual({ tagged: 3, downgraded: 0, kept: 3 });
  });

  it('downgrades an out-of-scope WARNING only in perf / style / test', () => {
    const { findings, stats } = applyIntentScope(
      (['perf', 'style', 'test'] as const).map((category) => f({ category })),
      medium,
    );
    expect(findings.map((x) => x.severity)).toEqual(['SUGGESTION', 'SUGGESTION', 'SUGGESTION']);
    expect(stats.downgraded).toBe(3);
  });

  it('tags a SUGGESTION without changing it', () => {
    const { findings, stats } = applyIntentScope([f({ severity: 'SUGGESTION' })], medium);
    expect(findings[0]).toMatchObject({ severity: 'SUGGESTION', original_severity: null, scope: 'out_of_scope' });
    expect(stats.downgraded).toBe(0);
  });

  it('leaves in-scope / untagged findings unchanged', () => {
    const { findings } = applyIntentScope([f({ scope: 'in_scope' }), f({ scope: null })], medium);
    expect(findings.map((x) => x.severity)).toEqual(['WARNING', 'WARNING']);
  });

  it('is a no-op with low confidence or no intent (scope kept as informational)', () => {
    for (const intent of [{ confidence: 'low' as const }, null, undefined]) {
      const { findings, stats } = applyIntentScope([f({})], intent);
      expect(findings[0]).toMatchObject({ severity: 'WARNING', original_severity: null, scope: 'out_of_scope' });
      expect(stats.downgraded).toBe(0);
    }
  });

  it('never drops: out.length === in.length in every case', () => {
    const input = [
      f({}),
      f({ severity: 'CRITICAL' }),
      f({ category: 'security' }),
      f({ category: 'bug' }),
      f({ severity: 'SUGGESTION' }),
      f({ scope: 'in_scope' }),
      f({ scope: null }),
    ];
    for (const intent of [medium, { confidence: 'high' as const }, { confidence: 'low' as const }, null]) {
      expect(applyIntentScope(input, intent).findings).toHaveLength(input.length);
    }
    expect(applyIntentScope([], medium).findings).toHaveLength(0);
  });

  it('does not mutate its input', () => {
    const input = [f({})];
    applyIntentScope(input, medium);
    expect(input[0]!.severity).toBe('WARNING');
  });
});
