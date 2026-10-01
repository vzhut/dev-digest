import { describe, expect, it } from 'vitest';
import { BLAST_CALLERS_SHOWN } from '../src/contracts.js';
import { buildBlastResult, type BlastDataInput } from '../src/format/blast.js';

const base = { repo: 'acme/api', pr: 12, limit: 20 };

function makeCaller(i: number) {
  return { name: `caller${i}`, file: `src/mod-${i % 5}/file.ts`, line: 10 + i };
}

function okData(overrides: Partial<BlastDataInput> = {}): BlastDataInput {
  return {
    changed_symbols: [{ name: 'runReview', file: 'server/src/modules/reviews/service.ts', kind: 'function' }],
    downstream: [
      {
        symbol: 'runReview',
        file: 'server/src/modules/reviews/service.ts',
        callers: Array.from({ length: 8 }, (_, i) => makeCaller(i)),
        callers_total: 8,
        endpoints_affected: ['POST /pulls/:id/review'],
        crons_affected: [],
      },
    ],
    summary: '1 of 1 changed symbol has callers: 8 callers, 1 endpoint, 0 crons.',
    degraded: false,
    reason: null,
    index_status: 'full',
    ...overrides,
  };
}

describe('buildBlastResult', () => {
  it('ok data → status:"ok", callers formatted as file:line, capped at BLAST_CALLERS_SHOWN', () => {
    const r = buildBlastResult({ ...base, data: okData() });
    expect(r.status).toBe('ok');
    expect(r.reason).toBeUndefined();
    expect(r.downstream[0]?.callers).toHaveLength(BLAST_CALLERS_SHOWN);
    expect(r.downstream[0]?.callers[0]?.where).toBe('src/mod-0/file.ts:10');
    expect(r.downstream[0]?.callers_total).toBe(8);
    expect(r.downstream[0]?.callers_total).toBeGreaterThanOrEqual(r.downstream[0]?.callers.length ?? 0);
    expect(r.downstream[0]?.endpoints_affected).toEqual(['POST /pulls/:id/review']);
    expect(r.downstream[0]?.crons_affected).toBeUndefined(); // empty array dropped
  });

  it('degraded index → status:"incomplete", reason, and a hint containing "resync"; never a bare empty map', () => {
    const data = okData({ downstream: [], changed_symbols: [], degraded: true, reason: 'index_partial', index_status: 'partial', summary: 'No indexed symbols in the changed files. Index incomplete (index_partial).' });
    const r = buildBlastResult({ ...base, data });
    expect(r.status).toBe('incomplete');
    expect(r.reason).toBe('index_partial');
    expect(r.index_status).toBe('partial');
    expect(r.hint).toContain('resync');
    expect(r.hint).toContain('index_partial');
    expect(r.summary.length).toBeGreaterThan(0);
    expect(r.downstream).toEqual([]);
  });

  it('full index, no callers for changed symbols → status:"ok" with an explicit summary, not a silent empty list', () => {
    const data = okData({ downstream: [], summary: 'None of 1 changed symbol has callers in the indexed code.' });
    const r = buildBlastResult({ ...base, data });
    expect(r.status).toBe('ok');
    expect(r.downstream).toEqual([]);
    expect(r.summary).toBe('None of 1 changed symbol has callers in the indexed code.');
    expect(r.reason).toBeUndefined();
  });

  it('limit bounds `downstream`, independent of the per-symbol caller cap; hint names the raise', () => {
    const downstream = Array.from({ length: 5 }, (_, i) => ({
      symbol: `sym${i}`,
      callers: [makeCaller(i)],
      callers_total: 1,
    }));
    const r = buildBlastResult({ repo: 'acme/api', pr: 12, limit: 2, data: okData({ downstream }) });
    expect(r.shown).toBe(2);
    expect(r.total).toBe(5);
    expect(r.hint).toContain('showing 2 of 5');
  });

  it('sanitises names and paths (control/ANSI chars stripped, length capped)', () => {
    const data = okData({
      changed_symbols: [{ name: 'evil\u0000Name', file: 'src/\u001b[31mfile.ts', kind: 'function' }],
      downstream: [{ symbol: 'evil\u0000Name', callers: [{ name: 'caller\u0000', file: 'a\u001b[31m.ts', line: 1 }], callers_total: 1 }],
    });
    const r = buildBlastResult({ ...base, data });
    expect(JSON.stringify(r)).not.toMatch(/\u0000|\u001b/);
    expect(r.changed_symbols[0]?.name).toBe('evilName');
  });

  it('keeps the server order and omits file/endpoints/crons when absent', () => {
    const downstream = [
      { symbol: 'b', callers: [makeCaller(0)], callers_total: 1 },
      { symbol: 'a', callers: [makeCaller(1)], callers_total: 1 },
    ];
    const r = buildBlastResult({ ...base, data: okData({ downstream }) });
    expect(r.downstream.map((d) => d.symbol)).toEqual(['b', 'a']);
    expect(r.downstream[0]?.file).toBeUndefined();
    expect(r.downstream[0]?.endpoints_affected).toBeUndefined();
  });

  it('unattributed_endpoints only appears when non-empty', () => {
    const withUnattributed = buildBlastResult({ ...base, data: okData({ unattributed_endpoints: ['GET /health'] }) });
    expect(withUnattributed.unattributed_endpoints).toEqual(['GET /health']);
    const without = buildBlastResult({ ...base, data: okData({ unattributed_endpoints: [] }) });
    expect(without.unattributed_endpoints).toBeUndefined();
  });
});
