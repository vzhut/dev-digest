import { describe, it, expect, vi } from 'vitest';
import { BlastService } from '../src/modules/blast/service.js';
import type { PullContext } from '../src/modules/blast/repository.js';
import type { BlastResult, IndexState, RepoIntel } from '../src/modules/repo-intel/types.js';
import { NotFoundError } from '../src/platform/errors.js';

const CTX: PullContext = {
  prId: 'pr1',
  number: 7,
  repoId: 'repo1',
  repoFullName: 'acme/api',
  base: 'main',
  headSha: 'head',
  files: ['src/a.ts', 'src/b.ts'],
};

const state = (over: Partial<IndexState> = {}): IndexState => ({
  repoId: 'repo1',
  status: 'full',
  filesIndexed: 10,
  filesSkipped: 0,
  durationMs: 1,
  lastIndexedSha: 'abc123',
  indexerVersion: 1,
  updatedAt: new Date(0),
  ...over,
});

const RESULT: BlastResult = {
  changedSymbols: [{ file: 'src/a.ts', name: 'alpha', kind: 'function' }],
  callers: [{ file: 'src/x.ts', symbol: 'handler', viaSymbol: 'alpha', line: 4, rank: 0.7 }],
  impactedEndpoints: ['GET /x'],
  factsByFile: { 'src/x.ts': { endpoints: ['GET /x'], crons: [] } },
  degraded: false,
};

function setup(over: { ctx?: PullContext | undefined; state?: IndexState; result?: BlastResult } = {}) {
  const getBlastRadius = vi.fn(async () => over.result ?? RESULT);
  const getIndexState = vi.fn(async () => over.state ?? state());
  const indexRepo = vi.fn(async () => {
    throw new Error('indexRepo must not be called');
  });
  const refreshIndex = vi.fn(async () => {
    throw new Error('refreshIndex must not be called');
  });
  // Full RepoIntel with throwing indexers; the service only receives the narrow Pick.
  const repoIntel = { getBlastRadius, getIndexState, indexRepo, refreshIndex } as unknown as RepoIntel;
  const log = { info: vi.fn() };
  const findPullContext = vi.fn(async () => ('ctx' in over ? over.ctx : CTX));
  const service = new BlastService({ repo: { findPullContext }, repoIntel, log });
  return { service, getBlastRadius, getIndexState, indexRepo, refreshIndex, log, findPullContext };
}

describe('BlastService.getBlast', () => {
  it('reads the index once with the PR files, never re-indexes, logs source=index', async () => {
    const t = setup();
    const out = await t.service.getBlast('ws1', 'pr1');

    expect(t.findPullContext).toHaveBeenCalledWith('ws1', 'pr1');
    expect(t.getBlastRadius).toHaveBeenCalledTimes(1);
    expect(t.getBlastRadius).toHaveBeenCalledWith('repo1', ['src/a.ts', 'src/b.ts']);
    expect(t.indexRepo).not.toHaveBeenCalled();
    expect(t.refreshIndex).not.toHaveBeenCalled();
    expect(out.downstream[0]!.endpoints_affected).toEqual(['GET /x']);
    expect(out.degraded).toBe(false);

    expect(t.log.info).toHaveBeenCalledTimes(1);
    const [payload, msg] = t.log.info.mock.calls[0]!;
    expect(payload).toMatchObject({
      event: 'blast.read',
      prId: 'pr1',
      repoId: 'repo1',
      source: 'index',
      indexStatus: 'full',
      indexedSha: 'abc123',
      degraded: false,
      callers: 1,
    });
    expect(msg).toContain('no re-parse, no LLM');
  });

  it('partial index → index_status partial, degraded true even though the facade said degraded:false', async () => {
    const t = setup({ state: state({ status: 'partial' }) });
    const out = await t.service.getBlast('ws1', 'pr1');
    expect(out).toMatchObject({ index_status: 'partial', degraded: true, reason: 'index_partial' });
  });

  it('facade fallback → source=fallback and the reason is passed through', async () => {
    const t = setup({
      state: state({ status: 'degraded', lastIndexedSha: '', degradedReason: 'no_data' }),
      result: { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true, reason: 'no_data' },
    });
    const out = await t.service.getBlast('ws1', 'pr1');
    expect(out).toMatchObject({ degraded: true, reason: 'no_data', indexed_sha: null });
    expect(t.log.info.mock.calls[0]![0]).toMatchObject({ source: 'fallback', reason: 'no_data' });
  });

  it('empty pr_files still makes exactly one facade call', async () => {
    const t = setup({ ctx: { ...CTX, files: [] }, result: { ...RESULT, changedSymbols: [], callers: [] } });
    const out = await t.service.getBlast('ws1', 'pr1');
    expect(t.getBlastRadius).toHaveBeenCalledTimes(1);
    expect(out.summary).toContain('No indexed symbols in the changed files.');
  });

  it('unknown PR → NotFoundError and no facade call', async () => {
    const t = setup({ ctx: undefined });
    await expect(t.service.getBlast('ws1', 'nope')).rejects.toBeInstanceOf(NotFoundError);
    expect(t.getBlastRadius).not.toHaveBeenCalled();
  });

  it('has no LLM dependency in its deps', () => {
    const deps = Object.keys(setup().service['deps' as keyof BlastService] as object);
    expect(deps.sort()).toEqual(['log', 'repo', 'repoIntel']);
  });
});
