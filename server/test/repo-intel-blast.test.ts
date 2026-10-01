import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import { capCallersPerSymbol, declFilesBySymbol, importersWithin } from '../src/modules/repo-intel/helpers.js';
import { MAX_CALLERS_PER_SYMBOL } from '../src/modules/repo-intel/constants.js';
import type { BlastCallerRow } from '../src/modules/repo-intel/types.js';

/**
 * Facade blast path: per-symbol cap (spec trap 1), pre-cap totals and the defensive
 * decl-file filter. No Postgres: the service's repository is patched (same pattern as
 * repo-intel-facade-degraded.test.ts).
 */

const row = (over: Partial<BlastCallerRow> & Pick<BlastCallerRow, 'file' | 'viaSymbol'>): BlastCallerRow => ({
  symbol: 'fn',
  line: 1,
  rank: 0.5,
  ...over,
});

const callersOf = (via: string, n: number, filePrefix = 'src/c'): BlastCallerRow[] =>
  Array.from({ length: n }, (_, i) => row({ file: `${filePrefix}${via}${i}.ts`, viaSymbol: via, rank: 1 - i / 100 }));

describe('capCallersPerSymbol', () => {
  it('caps each symbol independently and reports pre-cap totals', () => {
    const { callers, totals } = capCallersPerSymbol(
      [...callersOf('A', 25), ...callersOf('B', 3)],
      new Map(),
      20,
    );
    expect(callers.filter((c) => c.viaSymbol === 'A')).toHaveLength(20);
    expect(callers.filter((c) => c.viaSymbol === 'B')).toHaveLength(3);
    expect(totals).toEqual({ A: 25, B: 3 });
  });

  it('drops a caller living in a file that declares the symbol, and sorts by rank/file/line', () => {
    const decl = declFilesBySymbol([{ file: 'src/a.ts', name: 'A' }]);
    const { callers, totals } = capCallersPerSymbol(
      [
        row({ file: 'src/a.ts', viaSymbol: 'A' }),
        row({ file: 'src/z.ts', viaSymbol: 'A', rank: 0.9, line: 5 }),
        row({ file: 'src/y.ts', viaSymbol: 'A', rank: 0.9, line: 9 }),
        row({ file: 'src/y.ts', viaSymbol: 'A', rank: 0.9, line: 2 }),
      ],
      decl,
      20,
    );
    expect(callers.map((c) => `${c.file}:${c.line}`)).toEqual(['src/y.ts:2', 'src/y.ts:9', 'src/z.ts:5']);
    expect(totals.A).toBe(3);
  });
});

function buildService(opts: { flag: boolean; persistent?: boolean; refs?: Record<string, string[]> }) {
  const container = {
    config: { repoIntelEnabled: opts.flag },
    db: {} as never,
    codeIndex: {
      symbols: async () => [
        { path: 'src/a.ts', name: 'A', kind: 'function', line: 1 },
        { path: 'src/b.ts', name: 'A', kind: 'function', line: 1 },
      ],
      references: async (_r: unknown, name: string) =>
        (opts.refs?.[name] ?? []).map((fromPath, i) => ({ fromPath, toSymbol: name, line: i + 1 })),
    } as never,
  } as never;
  const svc = new RepoIntelService(container);
  const callerRows = [
    ...callersOf('A', 25).map((c) => ({ fromPath: c.file, toSymbol: 'A', line: c.line, rank: c.rank })),
    ...callersOf('B', 3).map((c) => ({ fromPath: c.file, toSymbol: 'B', line: c.line, rank: c.rank })),
  ];
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    getRepoBasics: async () => ({ id: 'r1', owner: 'o', name: 'n', clonePath: '/nonexistent-clone' }),
    tryGetIndexState: async () => (opts.persistent ? { status: 'full', lastIndexedSha: 'abc' } : null),
    getSymbolRows: async (_id: string, files: string[]) =>
      files.includes('src/a.ts')
        ? [
            { path: 'src/a.ts', name: 'A', kind: 'function', line: 1, endLine: 2, exported: true, signature: null },
            { path: 'src/a.ts', name: 'B', kind: 'function', line: 3, endLine: 4, exported: true, signature: null },
          ]
        : [],
    getResolvedCallers: async () => callerRows,
    getFileFacts: async () => [{ filePath: 'src/cA0.ts', endpoints: ['GET /x'], crons: [] }],
    getEdges: async () => [],
  };
  return svc;
}

describe('RepoIntel facade getBlastRadius — per-symbol cap', () => {
  it('persistent path: A keeps MAX_CALLERS_PER_SYMBOL, B is not starved, totals are pre-cap', async () => {
    const svc = buildService({ flag: true, persistent: true });
    const res = await svc.getBlastRadius('r1', ['src/a.ts']);
    expect(MAX_CALLERS_PER_SYMBOL).toBe(20);
    expect(res.callers.filter((c) => c.viaSymbol === 'A')).toHaveLength(20);
    expect(res.callers.filter((c) => c.viaSymbol === 'B')).toHaveLength(3);
    expect(res.callerTotals).toEqual({ A: 25, B: 3 });
    expect(res.degraded).toBe(false);
    expect(res.factsByFile?.['src/cA0.ts']?.endpoints).toEqual(['GET /x']);
  });

  it('ripgrep fallback: also capped per symbol, decl-file callers excluded', async () => {
    const many = Array.from({ length: 25 }, (_, i) => `src/r${i}.ts`);
    const svc = buildService({ flag: true, refs: { A: [...many, 'src/b.ts'] } });
    const res = await svc.getBlastRadius('r1', ['src/a.ts', 'src/b.ts']);
    expect(res.degraded).toBe(true);
    expect(res.reason).toBe('no_data');
    const viaA = res.callers.filter((c) => c.viaSymbol === 'A');
    expect(viaA).toHaveLength(20);
    expect(viaA.some((c) => c.file === 'src/b.ts')).toBe(false); // b.ts also declares A
    expect(res.callerTotals).toEqual({ A: 25 });
  });

  it('flag off → reason flag_off (not no_data)', async () => {
    const svc = buildService({ flag: false, persistent: true });
    const res = await svc.getBlastRadius('r1', ['src/a.ts']);
    expect(res.degraded).toBe(true);
    expect(res.reason).toBe('flag_off');
  });
});

describe('importersWithin', () => {
  it('follows the import graph backward up to depth, dedupes cycles, excludes the caller itself', () => {
    // routes.ts -> service.ts -> caller.ts (chain of imports), plus a cycle
    // back to routes.ts, which must not cause infinite recursion or dupes.
    const edges = [
      { fromFile: 'src/routes.ts', toFile: 'src/service.ts' },
      { fromFile: 'src/service.ts', toFile: 'src/caller.ts' },
      { fromFile: 'src/caller.ts', toFile: 'src/routes.ts' }, // cycle
    ];
    const depth1 = importersWithin(edges, ['src/caller.ts'], 1);
    expect(depth1.get('src/caller.ts')).toEqual(new Set(['src/service.ts']));

    const depth2 = importersWithin(edges, ['src/caller.ts'], 2);
    expect(depth2.get('src/caller.ts')).toEqual(new Set(['src/service.ts', 'src/routes.ts']));

    // depth 3 would re-visit caller.ts via the cycle — must stay the same set.
    const depth3 = importersWithin(edges, ['src/caller.ts'], 3);
    expect(depth3.get('src/caller.ts')).toEqual(new Set(['src/service.ts', 'src/routes.ts']));
  });

  it('returns an empty set per caller file at depth 0 or with no callers', () => {
    const edges = [{ fromFile: 'src/routes.ts', toFile: 'src/service.ts' }];
    expect(importersWithin(edges, ['src/service.ts'], 0).get('src/service.ts')).toEqual(new Set());
    expect(importersWithin(edges, [], 1).size).toBe(0);
  });
});

describe('RepoIntel facade getBlastRadius — depth-2 endpoint attribution (T10, OD2)', () => {
  /**
   * helper.ts <- service.ts (caller) <- routes.ts (facts: GET /x) <- app.ts
   * (facts: GET /y, hop 3). Only routes.ts (hop 2, BFS_DEPTH - 1 = 1 importer
   * hop from the caller) is attributed to service.ts; app.ts is not.
   */
  function buildDepthService() {
    const container = {
      config: { repoIntelEnabled: true },
      db: {} as never,
    } as never;
    const svc = new RepoIntelService(container);
    (svc as unknown as { repo: Record<string, unknown> }).repo = {
      tryGetIndexState: async () => ({ status: 'full', lastIndexedSha: 'abc' }),
      getSymbolRows: async (_id: string, files: string[]) =>
        files.includes('src/helper.ts')
          ? [{ path: 'src/helper.ts', name: 'A', kind: 'function', line: 1, endLine: 2, exported: true, signature: null }]
          : files.includes('src/service.ts')
            ? [{ path: 'src/service.ts', name: 'callerFn', kind: 'function', line: 1, endLine: 10, exported: true, signature: null }]
            : [],
      getResolvedCallers: async () => [{ fromPath: 'src/service.ts', toSymbol: 'A', line: 5, rank: 1 }],
      getEdges: async () => [
        { fromFile: 'src/routes.ts', toFile: 'src/service.ts' },
        { fromFile: 'src/app.ts', toFile: 'src/routes.ts' },
      ],
      getFileFacts: async (_id: string, files: string[]) => {
        const known: Record<string, { endpoints: string[]; crons: string[] }> = {
          'src/service.ts': { endpoints: [], crons: [] },
          'src/routes.ts': { endpoints: ['GET /x'], crons: [] },
          'src/app.ts': { endpoints: ['GET /y'], crons: [] },
        };
        return files.map((f) => ({ filePath: f, ...(known[f] ?? { endpoints: [], crons: [] }) }));
      },
    };
    return svc;
  }

  it('attributes the hop-2 importer endpoint to the caller, but not the hop-3 one', async () => {
    const svc = buildDepthService();
    const res = await svc.getBlastRadius('r1', ['src/helper.ts']);
    expect(res.degraded).toBe(false);
    expect(res.factsByFile?.['src/service.ts']?.endpoints).toEqual(['GET /x']);
    expect(res.factsByFile?.['src/service.ts']?.endpoints).not.toContain('GET /y');
    expect(res.impactedEndpoints).toContain('GET /x');
    expect(res.impactedEndpoints).not.toContain('GET /y');
  });
});
