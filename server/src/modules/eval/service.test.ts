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

function build(over: Partial<EvalServiceDeps['repo']> = {}, llm: EvalServiceDeps['llm'] = async () => ({}) as LLMProvider) {
  const repo = {
    agentSnapshot: vi.fn(async () => ({ agent: agentRow, skillLinks: [] })),
    listCasesForAgent: vi.fn(async () => [caseRow('c1')]),
    insertRunningRun: vi.fn(async () => ({ id: 'run-1' }) as EvalRunRow),
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
    parseDiff: () => ({ raw: '', files: [] }),
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
    expect(reason).toContain('db went away');
    expect(reason).not.toContain('sk-abcdefghijklmnop'); // redacted before it is stored
    expect(log.error).toHaveBeenCalled();
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

describe('EvalService.runAll', () => {
  it('reports started and skipped (a conflict or no cases) without throwing', async () => {
    const { service } = build({
      agentsWithCases: vi.fn(async () => [
        { id: 'a1', name: 'A', model: 'm', casesTotal: 1 },
        { id: 'a2', name: 'B', model: 'm', casesTotal: 1 },
      ]),
      insertRunningRun: vi.fn(async (v: { agentId: string }) => {
        if (v.agentId === 'a2') {
          const { EvalRequestError } = await import('./errors.js');
          throw new EvalRequestError('eval_run_in_progress', 'busy', 409);
        }
        return { id: 'run-1' } as EvalRunRow;
      }),
    });
    const out = await service.runAll('ws', { correlationId: 'r' });
    expect(out.started).toEqual(['a1']);
    expect(out.skipped).toEqual([{ agent_id: 'a2', reason: 'eval_run_in_progress' }]);
  });
});
