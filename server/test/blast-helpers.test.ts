import { describe, it, expect } from 'vitest';
import { BlastRadius, PrHistory } from '@devdigest/shared';
import { buildSummary, toBlastRadius, toPrHistory } from '../src/modules/blast/helpers.js';
import type { BlastCallerRow, BlastResult } from '../src/modules/repo-intel/types.js';
import type { PriorPr } from '../src/adapters/github/history.js';

const FULL = { status: 'full', lastIndexedSha: 'abc123', degradedReason: undefined } as const;

const caller = (
  file: string,
  via: string,
  over: Partial<BlastCallerRow> = {},
): BlastCallerRow => ({ file, symbol: 'fn', viaSymbol: via, line: 10, rank: 0.5, ...over });

const base = (over: Partial<BlastResult> = {}): BlastResult => ({
  changedSymbols: [
    { file: 'src/a.ts', name: 'alpha', kind: 'function' },
    { file: 'src/a.ts', name: 'beta', kind: 'function' },
    { file: 'src/a.ts', name: 'lonely', kind: 'function' },
  ],
  callers: [],
  impactedEndpoints: [],
  degraded: false,
  ...over,
});

describe('toBlastRadius', () => {
  it('groups flat callers by symbol, hides zero-caller symbols (D3), and counts them in stats', () => {
    const out = toBlastRadius(
      base({
        callers: [
          caller('src/x.ts', 'alpha', { line: 3 }),
          caller('src/y.ts', 'alpha', { line: 4 }),
          caller('src/z.ts', 'beta', { line: 5 }),
        ],
        factsByFile: {},
      }),
      FULL,
    );
    expect(out.downstream.map((d) => d.symbol).sort()).toEqual(['alpha', 'beta']);
    expect(out.downstream.find((d) => d.symbol === 'alpha')!.callers).toEqual([
      { name: 'fn', file: 'src/x.ts', line: 3 },
      { name: 'fn', file: 'src/y.ts', line: 4 },
    ]);
    expect(out.changed_symbols.map((s) => s.name).sort()).toEqual(['alpha', 'beta']);
    expect(out.stats).toMatchObject({ symbols_changed: 3, symbols_affected: 2, callers: 3 });
    expect(out.downstream[0]!.file).toBe('src/a.ts');
    expect(BlastRadius.parse(out)).toBeTruthy();
  });

  it('never lists a caller from a file that declares the symbol (P2.5)', () => {
    const out = toBlastRadius(
      base({
        changedSymbols: [
          { file: 'src/a.ts', name: 'alpha', kind: 'function' },
          { file: 'src/b.ts', name: 'alpha', kind: 'function' },
        ],
        callers: [caller('src/a.ts', 'alpha'), caller('src/b.ts', 'alpha'), caller('src/c.ts', 'alpha')],
        factsByFile: {},
      }),
      FULL,
    );
    expect(out.downstream[0]!.callers.map((c) => c.file)).toEqual(['src/c.ts']);
    expect(out.downstream[0]!.file).toBe('src/a.ts');
  });

  it('attributes endpoints and crons per group from factsByFile, crons separate', () => {
    const out = toBlastRadius(
      base({
        callers: [caller('src/x.ts', 'alpha'), caller('src/y.ts', 'alpha'), caller('src/z.ts', 'beta')],
        factsByFile: {
          'src/x.ts': { endpoints: ['GET /a'], crons: ['0 * * * *'] },
          'src/y.ts': { endpoints: ['GET /a', 'POST /b'], crons: [] },
          'src/z.ts': { endpoints: [], crons: [] },
        },
      }),
      FULL,
    );
    const alpha = out.downstream.find((d) => d.symbol === 'alpha')!;
    expect(alpha.endpoints_affected).toEqual(['GET /a', 'POST /b']);
    expect(alpha.crons_affected).toEqual(['0 * * * *']);
    expect(out.downstream.find((d) => d.symbol === 'beta')!.endpoints_affected).toEqual([]);
    expect(out.stats).toMatchObject({ endpoints: 2, crons: 1 });
    expect(out.unattributed_endpoints).toBeUndefined();
  });

  it('fallback without factsByFile: per-group lists empty, endpoints go to unattributed_endpoints', () => {
    const out = toBlastRadius(
      base({
        callers: [caller('src/x.ts', 'alpha', { rank: 0 })],
        impactedEndpoints: ['GET /a'],
        degraded: true,
        reason: 'no_data',
      }),
      { status: 'degraded', lastIndexedSha: '', degradedReason: 'no_data' },
    );
    expect(out.downstream[0]!.endpoints_affected).toEqual([]);
    expect(out.downstream[0]!.crons_affected).toEqual([]);
    expect(out.unattributed_endpoints).toEqual(['GET /a']);
    expect(out.indexed_sha).toBeNull();
    expect(out.degraded).toBe(true);
    expect(out.reason).toBe('no_data');
    expect(BlastRadius.parse(out)).toBeTruthy();
  });

  it('partial index with degraded:false is reported as degraded/index_partial (trap 2)', () => {
    const out = toBlastRadius(base({ callers: [caller('src/x.ts', 'alpha')], factsByFile: {} }), {
      status: 'partial',
      lastIndexedSha: 'abc123',
    });
    expect(out).toMatchObject({ degraded: true, reason: 'index_partial', index_status: 'partial', indexed_sha: 'abc123' });
    expect(out.summary).toContain('Index incomplete (index_partial).');
  });

  it('a full, healthy index is not degraded and has a null reason', () => {
    const out = toBlastRadius(base({ callers: [caller('src/x.ts', 'alpha')], factsByFile: {} }), FULL);
    expect(out).toMatchObject({ degraded: false, reason: null, index_status: 'full' });
  });

  it('orders groups by max rank, then callers_total, and uses callerTotals as callers_total', () => {
    const out = toBlastRadius(
      base({
        callers: [
          caller('src/x.ts', 'alpha', { rank: 0.2 }),
          caller('src/y.ts', 'beta', { rank: 0.9 }),
        ],
        callerTotals: { alpha: 30, beta: 1 },
        factsByFile: {},
      }),
      FULL,
    );
    expect(out.downstream.map((d) => d.symbol)).toEqual(['beta', 'alpha']);
    expect(out.downstream[1]!.callers_total).toBe(30);
    expect(out.stats!.callers).toBe(31);
  });

  it('sorts callers within a group by rank desc, then file, then line', () => {
    const out = toBlastRadius(
      base({
        callers: [
          caller('src/b.ts', 'alpha', { rank: 0.5, line: 1 }),
          caller('src/d.ts', 'alpha', { rank: 0.5, line: 9 }),
          caller('src/d.ts', 'alpha', { rank: 0.5, line: 2 }),
          caller('src/c.ts', 'alpha', { rank: 0.9, line: 1 }),
        ],
        factsByFile: {},
      }),
      FULL,
    );
    expect(out.downstream[0]!.callers.map((c) => `${c.file}:${c.line}`)).toEqual([
      'src/c.ts:1',
      'src/b.ts:1',
      'src/d.ts:2',
      'src/d.ts:9',
    ]);
  });
});

describe('toPrHistory', () => {
  const priorPr = (n: number, mergedAt: string, over: Partial<PriorPr> = {}): PriorPr => ({
    number: n,
    title: `PR #${n}`,
    mergedAt,
    author: 'octocat',
    filesOverlap: ['src/a.ts'],
    ...over,
  });

  it('excludes the current PR, sorts newest first, caps at HISTORY_MAX_ITEMS and writes numbers-only notes', () => {
    const items = [
      priorPr(7, '2026-01-05T00:00:00Z'), // current PR — excluded
      priorPr(2, '2026-01-01T00:00:00Z', { filesOverlap: ['src/a.ts'] }),
      priorPr(3, '2026-01-10T00:00:00Z', { filesOverlap: ['src/a.ts', 'src/b.ts'] }),
      priorPr(4, '2026-01-09T00:00:00Z'),
      priorPr(5, '2026-01-08T00:00:00Z'),
      priorPr(6, '2026-01-07T00:00:00Z'),
      priorPr(8, '2026-01-06T00:00:00Z'),
    ];
    const out = toPrHistory(items, 7, ['src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect(out.history).toHaveLength(5); // HISTORY_MAX_ITEMS
    expect(out.history.map((h) => h.pr_number)).toEqual([3, 4, 5, 6, 8]);
    expect(out.history[0]).toMatchObject({
      pr_number: 3,
      files_overlap: ['src/a.ts', 'src/b.ts'],
      notes: 'touched 2 of 3 changed files',
    });
    expect(out.history[1]).toMatchObject({ notes: 'touched 1 of 3 changed files' });
    expect(PrHistory.parse(out)).toBeTruthy();
  });

  it('empty input → empty history', () => {
    const out = toPrHistory([], 7, ['src/a.ts']);
    expect(out.history).toEqual([]);
  });
});

describe('buildSummary', () => {
  const stats = { symbols_changed: 5, symbols_affected: 2, callers: 3, endpoints: 4, crons: 0 };
  it('matches the documented strings exactly', () => {
    expect(buildSummary(stats, false, null)).toBe('2 of 5 changed symbols have callers: 3 callers, 4 endpoints, 0 crons.');
    expect(buildSummary({ ...stats, symbols_affected: 0, callers: 0, endpoints: 0 }, false, null)).toBe(
      'None of 5 changed symbols has callers in the indexed code.',
    );
    expect(buildSummary({ ...stats, symbols_changed: 0, symbols_affected: 0 }, false, null)).toBe(
      'No indexed symbols in the changed files.',
    );
    expect(buildSummary(stats, true, 'index_partial')).toBe(
      '2 of 5 changed symbols have callers: 3 callers, 4 endpoints, 0 crons. Index incomplete (index_partial).',
    );
  });
});
