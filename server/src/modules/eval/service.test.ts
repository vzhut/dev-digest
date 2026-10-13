import { describe, it, expect, vi } from 'vitest';
import type { LLMProvider } from '@devdigest/shared';
import { EvalService, type EvalServiceDeps } from './service.js';
import type { EvalRunRow } from './repository.js';

const caseRow = (id: string) => ({
  id,
  workspaceId: 'ws',
  ownerKind: 'agent' as const,
  ownerId: 'a1',
  agentId: 'a1',
  sourceFindingId: `f-${id}`,
  name: `must_find-${id}`,
  inputDiff: 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -0,0 +1,1 @@\n+x',
  inputFiles: ['x'],
  inputMeta: { source_finding_id: 'f', source_review_id: 'r', repo: 'a/b', pr_number: 1, head_sha: 'h', pr_title: 't' },
  expectedOutput: { type: 'must_find' as const, file: 'x', start_line: 1, end_line: 1 },
  notes: null,
  createdAt: new Date(),
});

const agentRow = { id: 'a1', name: 'General', model: 'm', provider: 'openrouter', systemPrompt: 'p', strategy: 'single-pass', version: 3 };

function build(
  over: Partial<EvalServiceDeps['repo']> = {},
  llm: EvalServiceDeps['llm'] = async () => ({}) as LLMProvider,
  parseDiff: EvalServiceDeps['parseDiff'] = () => ({ raw: '', files: [] }),
) {
  const repo = {
    agentSnapshot: vi.fn(async () => ({ agent: agentRow, skillLinks: [] })),
    listCasesForAgent: vi.fn(async () => [caseRow('c1')]),
    insertRunningRun: vi.fn(async () => ({ ok: true as const, run: { id: 'run-1' } as EvalRunRow })),
    markProgress: vi.fn(async () => {}),
    finishRun: vi.fn(async () => {}),
    failRun: vi.fn(async () => {}),
    agentsWithCases: vi.fn(async () => []),
    agentExists: vi.fn(async () => true),
    ...over,
  };
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const service = new EvalService({
    repo: repo as unknown as EvalServiceDeps['repo'],
    parseDiff,
    llm,
    log,
  });
  return { service, repo, log };
}

describe('EvalService.startRun', () => {
  it('returns running before the background run settles', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { service, repo } = build({}, async () => {
      await gate;
      throw new Error('no key');
    });
    const out = await service.startRun('ws', 'a1', { correlationId: 'req-1' });
    expect(out).toEqual({ eval_run_id: 'run-1', status: 'running' });
    expect(repo.finishRun).not.toHaveBeenCalled();
    release();
    await vi.waitFor(() => expect(repo.finishRun).toHaveBeenCalledTimes(1));
    // D5: provider failure → the run still completes, every case errored
    expect(repo.finishRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ status: 'completed' }));
  });

  it('persists a run-level failure as errored instead of letting the rejection escape', async () => {
    const failRun = vi.fn(async (_id: string, _reason: string) => {});
    const { service, log } = build({
      failRun,
      markProgress: vi.fn(async () => {
        throw new Error('db went away sk-abcdefghijklmnop');
      }),
    });
    await service.startRun('ws', 'a1', { correlationId: 'req-1' });
    await vi.waitFor(() => expect(failRun).toHaveBeenCalledTimes(1));
    const [id, reason] = failRun.mock.calls[0]!;
    expect(id).toBe('run-1');
    // the stored reason is stable: nothing of the raw error reaches the run row or the API
    expect(reason).toBe('run failed');
    const logged = JSON.stringify(log.error.mock.calls);
    expect(logged).toContain('db went away'); // the detail is in the server log...
    expect(logged).not.toContain('sk-abcdefghijklmnop'); // ...redacted
  });

  it('rejects an unknown agent and an agent without cases before inserting a run', async () => {
    const unknown = build({ agentSnapshot: vi.fn(async () => undefined) });
    await expect(unknown.service.startRun('ws', 'a1', { correlationId: 'r' })).rejects.toMatchObject({ statusCode: 404 });
    const empty = build({ listCasesForAgent: vi.fn(async () => []) });
    await expect(empty.service.startRun('ws', 'a1', { correlationId: 'r' })).rejects.toMatchObject({
      code: 'no_eval_cases',
      statusCode: 422,
    });
    expect(empty.repo.insertRunningRun).not.toHaveBeenCalled();
  });
});

describe('EvalService.startRun with case_ids (AC-46)', () => {
  it('runs only the chosen subset and rejects an id that is not the agent’s', async () => {
    const insertRunningRun = vi.fn(async (v: { caseIds: string[] }) => ({
      ok: true as const,
      run: { id: 'run-1', caseIds: v.caseIds } as unknown as EvalRunRow,
    }));
    const { service } = build({
      listCasesForAgent: vi.fn(async () => [caseRow('c1'), caseRow('c2'), caseRow('c3')]),
      insertRunningRun,
    });
    await service.startRun('ws', 'a1', { correlationId: 'r', caseIds: ['c3', 'c1', 'c3'] });
    expect(insertRunningRun.mock.calls[0]![0].caseIds).toEqual(['c1', 'c3']);

    await expect(service.startRun('ws', 'a1', { correlationId: 'r', caseIds: ['c1', 'zzz'] })).rejects.toMatchObject({
      code: 'unknown_case',
      statusCode: 422,
    });
    expect(insertRunningRun).toHaveBeenCalledTimes(1);
  });
});

describe('EvalService.runAll', () => {
  const two = [
    { id: 'a1', name: 'A', model: 'm', casesTotal: 1 },
    { id: 'a2', name: 'B', model: 'm', casesTotal: 1 },
  ];

  it('reports started and skipped (an already-running agent) without throwing', async () => {
    const { service } = build({
      agentsWithCases: vi.fn(async () => two),
      insertRunningRun: vi.fn(async (v: { agentId: string }) =>
        v.agentId === 'a2' ? { ok: false as const, reason: 'already_running' as const } : { ok: true as const, run: { id: 'run-1' } as EvalRunRow },
      ),
    });
    const out = await service.runAll('ws', { correlationId: 'r' });
    expect(out.started).toEqual(['a1']);
    expect(out.skipped).toEqual([{ agent_id: 'a2', reason: 'eval_run_in_progress' }]);
  });

  it('an unexpected failure of one agent never hides the runs already started (internal_error, detail in the log)', async () => {
    const { service, log } = build({
      agentsWithCases: vi.fn(async () => two),
      insertRunningRun: vi.fn(async (v: { agentId: string }) => {
        if (v.agentId === 'a2') throw new Error('connection reset sk-abcdefghijklmnop');
        return { ok: true as const, run: { id: 'run-1' } as EvalRunRow };
      }),
    });
    const out = await service.runAll('ws', { correlationId: 'r' });
    expect(out).toEqual({ started: ['a1'], skipped: [{ agent_id: 'a2', reason: 'internal_error' }] });
    const logged = JSON.stringify(log.error.mock.calls);
    expect(logged).toContain('connection reset');
    expect(logged).not.toContain('sk-abcdefghijklmnop');
  });

  it('rethrows an unexpected failure only when nothing was started', async () => {
    const { service } = build({
      agentsWithCases: vi.fn(async () => two),
      insertRunningRun: vi.fn(async () => {
        throw new Error('db down');
      }),
    });
    await expect(service.runAll('ws', { correlationId: 'r' })).rejects.toThrow('db down');
  });
});

describe('case cap (1a5b)', () => {
  const diff = ['--- a/x.ts', '+++ b/x.ts', '@@ -0,0 +1,2 @@', '+a', '+b'].join('\n');
  const body = {
    name: 'n',
    input_diff: diff,
    expectation: { type: 'must_find' as const, file: 'x.ts', start_line: 1, end_line: 1 },
  };

  it('maps the repository\'s "limit" result of a manual create to 422 case_limit_reached', async () => {
    const insertManualCase = vi.fn(async () => ({ kind: 'limit' as const })); // the repository enforces the cap atomically
    const { service } = build(
      { agentExists: vi.fn(async () => true), insertManualCase } as never,
      async () => ({}) as LLMProvider,
      () => ({
        raw: diff,
        files: [{ path: 'x.ts', additions: 2, deletions: 0, hunks: [{ file: 'x.ts', oldStart: 0, oldLines: 0, newStart: 1, newLines: 2, newLineNumbers: [1, 2] }] }],
      }),
    );
    await expect(service.createManual('ws', 'a1', body)).rejects.toMatchObject({ code: 'case_limit_reached', statusCode: 422 });
    expect(insertManualCase).toHaveBeenCalledWith(expect.anything(), 200);
  });
});
