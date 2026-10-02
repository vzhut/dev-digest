import { describe, it, expect, vi, afterEach } from 'vitest';
import type { LLMProvider, StructuredRequest, StructuredResult, Tour, TourFacts } from '@devdigest/shared';
import { OnboardingService, type OnboardingServiceDeps } from '../src/modules/onboarding/service.js';
import { ConfigError, ConflictError } from '../src/platform/errors.js';

/**
 * Hermetic: the service only sees injected functions. `llm(provider)` hands out
 * the fake for the resolved provider and FAILS FAST for every other provider
 * (openai / anthropic / openrouter), so a machine holding a real API key can never
 * turn this suite into a paid call (server/INSIGHTS.md "pre-review LLM call").
 */
const WS = 'ws-1';
const REPO = 'repo-1';
const SECRET_README = 'SECRET-README-LINE-do-not-log';

const FACTS: TourFacts = {
  source_sha: 'abc1234',
  index: {
    status: 'ready',
    reason: null,
    files_indexed: 3,
    files_skipped: 0,
    files_total: 3,
    bounded: false,
    hotness_available: true,
    usable: true,
    unusable_reason: null,
    last_indexed_sha: 'abc1234',
  },
  stack: [{ name: 'TypeScript', evidence_path: 'package.json' }],
  structure: [{ path: 'src', files: 3 }],
  routes: [{ method: 'GET', path: '/x', file: 'src/a.ts' }],
  run_locally: [{ command: 'pnpm dev', source_path: 'package.json' }],
  critical_paths: [{ path: 'src/a.ts', computed_reason: 'imported by 2 files · rank p99' }],
  reading_path: [
    { path: 'src/a.ts', score: 0.5, pagerank: 0.4, hotness: 0.25, computed_reason: 'imported by 2 files · rank p99' },
  ],
  readme: { path: 'README.md', text: SECRET_README },
};

const OUTPUT = {
  architecture_summary_md: 'A small service.',
  architecture_diagram: null,
  critical_path_reasons: [{ path: 'src/a.ts', reason: 'Entry point.' }],
  reading_path_whys: [{ path: 'src/a.ts', why: 'Start here.' }],
  command_notes: [{ command: 'pnpm dev', note: 'Needs postgres.' }],
  first_tasks: [
    { title: 'Add a test', path: 'src/a.ts', complexity: 'low' },
    { title: 'Invented', path: 'nope/missing.ts', complexity: 'low' },
  ],
};

type Behaviour = (req: StructuredRequest<unknown>) => Promise<StructuredResult<unknown>>;

class FakeLlm implements LLMProvider {
  readonly id = 'openrouter' as unknown as LLMProvider['id'];
  calls: StructuredRequest<unknown>[] = [];
  constructor(private behaviour: Behaviour) {}
  async listModels() {
    return [];
  }
  async complete(): Promise<never> {
    throw new Error('unexpected complete()');
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push(req as StructuredRequest<unknown>);
    return (await this.behaviour(req as StructuredRequest<unknown>)) as StructuredResult<T>;
  }
  async embed(): Promise<number[][]> {
    throw new Error('unexpected embed()');
  }
}

const ok = (data: unknown = OUTPUT): Behaviour => async (req) => ({
  data,
  model: req.model,
  tokensIn: 1000,
  tokensOut: 200,
  costUsd: 0.0123,
  raw: '',
  attempts: 1,
});

function memRepo(opts: { clonePath?: string | null; stored?: Tour | null; otherWorkspace?: boolean } = {}) {
  let stored: Tour | null = opts.stored ?? null;
  const calls = { save: 0, lastAttempt: 0 };
  const repo: OnboardingServiceDeps['repo'] = {
    getRepoForWorkspace: async (ws: string, id: string) =>
      opts.otherWorkspace || ws !== WS || id !== REPO
        ? undefined
        : ({ id: REPO, owner: 'acme', name: 'api', clonePath: opts.clonePath === undefined ? '/clones/acme-api' : opts.clonePath } as never),
    getTour: async () => stored,
    saveTour: async (_id: string, t: Tour) => {
      calls.save += 1;
      stored = t;
    },
    setLastAttempt: async (_id: string, la: NonNullable<Tour['last_attempt']>) => {
      calls.lastAttempt += 1;
      if (stored) stored = { ...stored, last_attempt: la };
    },
  };
  return { repo, calls, get stored() { return stored; } };
}

function setup(over: {
  llm?: FakeLlm;
  facts?: TourFacts;
  repo?: ReturnType<typeof memRepo>;
  cloneExists?: (d: string) => Promise<boolean>;
  resolveError?: Error;
  llmTimeoutMs?: number;
  indexSha?: string | null;
} = {}) {
  const llm = over.llm ?? new FakeLlm(ok());
  const mem = over.repo ?? memRepo();
  const logs: { obj: unknown; msg?: string }[] = [];
  const sink = (obj: unknown, msg?: string) => void logs.push({ obj, msg });
  const getLlm = vi.fn(async (provider: string) => {
    if (over.resolveError) throw over.resolveError;
    if (provider !== 'openrouter') throw new Error(`fail-fast: provider ${provider} must not be reached`);
    return llm;
  });
  const classify = vi.fn(async (_r: string, _s: string, paths: string[]) =>
    Object.fromEntries(paths.map((p) => [p, p === 'src/a.ts' ? 'file' : 'missing'])) as Record<string, 'file' | 'dir' | 'missing'>,
  );
  const service = new OnboardingService({
    repo: mem.repo,
    facts: async () => over.facts ?? FACTS,
    classifyPaths: classify,
    indexSha: async () => (over.indexSha === undefined ? 'abc1234' : over.indexSha),
    cloneExists: over.cloneExists ?? (async () => true),
    llm: getLlm as never,
    resolveModel: async () => ({ provider: 'openrouter', model: 'm-1' }),
    tokenizer: { count: (t: string) => Math.ceil(t.length / 4) },
    log: { info: sink, warn: sink, error: sink, debug: sink },
    llmTimeoutMs: over.llmTimeoutMs,
  });
  return { service, llm, mem, logs, classify, getLlm };
}

const codeOf = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string; statusCode?: number }) => ({ code: e.code, statusCode: e.statusCode }));

afterEach(() => vi.useRealTimers());

describe('OnboardingService.generate', () => {
  it('llm path: exactly one single-attempt call, merges text onto the facts, logs once without repo text', async () => {
    const { service, llm, mem, logs } = setup();
    const tour = await service.generate(WS, REPO, { correlationId: 'req-1' });

    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]).toMatchObject({ singleAttempt: true, maxRetries: 0, timeoutMs: 90_000, maxTokens: 6_000, schemaName: 'OnboardingTour' });
    expect(tour.mode).toBe('llm');
    expect(tour.usage).toMatchObject({ llm_calls: 1, tokens_in: 1000, tokens_out: 200, cost_usd: 0.0123, model: 'openrouter/m-1', dropped_items: 1 });
    expect(tour.critical_paths[0]).toMatchObject({ path: 'src/a.ts', reason: 'Entry point.' });
    expect(tour.first_tasks.map((t) => t.path)).toEqual(['src/a.ts']);
    expect(tour.last_attempt ?? null).toBeNull();
    expect(mem.stored).toEqual(tour);

    const generated = logs.filter((l) => l.msg?.startsWith('onboarding: generated'));
    expect(generated).toHaveLength(1);
    expect(generated[0]!.msg).toContain('llm_calls=1');
    expect(generated[0]!.msg).toContain('cost=$0.012300');
    expect(logs.filter((l) => (l.obj as { event?: string }).event === 'prompt.assembled')).toHaveLength(1);
    expect(JSON.stringify(logs)).not.toContain(SECRET_README);
  });

  it('schema-invalid response: one call, llm_failed skeleton with tokens/cost from err.usage', async () => {
    const llm = new FakeLlm(async () => {
      throw Object.assign(new Error('schema validation failed'), { usage: { tokensIn: 900, tokensOut: 50, costUsd: 0.004 } });
    });
    const { service } = setup({ llm });
    const tour = await service.generate(WS, REPO);
    expect(llm.calls).toHaveLength(1);
    expect(tour).toMatchObject({ mode: 'skeleton', skeleton_reason: 'llm_failed' });
    expect(tour.usage).toMatchObject({ llm_calls: 1, tokens_in: 900, tokens_out: 50, cost_usd: 0.004 });
  });

  it('transport error: one call, no retry, usage 0/0/null', async () => {
    const llm = new FakeLlm(async () => {
      throw new Error('500 upstream api_key=sk-or-v1-abcdefabcdefabcdefabcdef');
    });
    const { service } = setup({ llm });
    const tour = await service.generate(WS, REPO);
    expect(llm.calls).toHaveLength(1);
    expect(tour.skeleton_reason).toBe('llm_failed');
    expect(tour.usage).toMatchObject({ llm_calls: 1, tokens_in: 0, tokens_out: 0, cost_usd: null });
    expect(tour.skeleton_detail).not.toContain('abcdefabcdef');
  });

  it('a hung call is abandoned by the backstop timeout', async () => {
    vi.useFakeTimers();
    const llm = new FakeLlm(() => new Promise(() => {}));
    const { service } = setup({ llm, llmTimeoutMs: 50 });
    const p = service.generate(WS, REPO);
    await vi.advanceTimersByTimeAsync(50 + 5_000);
    const tour = await p;
    expect(tour).toMatchObject({ mode: 'skeleton', skeleton_reason: 'llm_failed' });
    expect(tour.skeleton_detail).toContain('timed out');
  });

  it.each(['no_data', 'failed', 'degraded', 'flag_off', 'no_ranked_files', 'sha_missing'] as const)(
    'unusable index (%s): 0 LLM calls, index_degraded skeleton, no prompt.assembled',
    async (reason) => {
      const facts: TourFacts = { ...FACTS, index: { ...FACTS.index, usable: false, unusable_reason: reason } };
      const { service, llm, logs, getLlm } = setup({ facts });
      const tour = await service.generate(WS, REPO);
      expect(llm.calls).toHaveLength(0);
      expect(getLlm).not.toHaveBeenCalled();
      expect(tour).toMatchObject({ mode: 'skeleton', skeleton_reason: 'index_degraded', first_tasks: [] });
      expect(tour.usage).toMatchObject({ llm_calls: 0, tokens_in: 0, tokens_out: 0, cost_usd: null, model: null });
      expect(logs.some((l) => (l.obj as { event?: string }).event === 'prompt.assembled')).toBe(false);
      expect(logs.filter((l) => l.msg?.startsWith('onboarding: generated'))).toHaveLength(1);
    },
  );

  it('no key: 0 calls, llm_unavailable, detail carries no secret', async () => {
    const { service, llm } = setup({ resolveError: new ConfigError('OPENROUTER_API_KEY is not configured sk-or-v1-abcdefabcdefabcdefabcdef') });
    const tour = await service.generate(WS, REPO);
    expect(llm.calls).toHaveLength(0);
    expect(tour).toMatchObject({ mode: 'skeleton', skeleton_reason: 'llm_unavailable' });
    expect(tour.usage.llm_calls).toBe(0);
    expect(tour.skeleton_detail).not.toContain('abcdefabcdef');
  });

  it('failed regeneration keeps the stored full tour and records last_attempt', async () => {
    const first = setup();
    const full = await first.service.generate(WS, REPO);
    const mem = memRepo({ stored: full });
    const failing = new FakeLlm(async () => {
      throw Object.assign(new Error('schema validation failed'), { usage: { tokensIn: 10, tokensOut: 2, costUsd: 0.001 } });
    });
    const { service } = setup({ repo: mem, llm: failing });
    const tour = await service.generate(WS, REPO);

    expect(failing.calls).toHaveLength(1);
    expect(mem.calls.save).toBe(0);
    expect(mem.calls.lastAttempt).toBe(1);
    expect(tour.mode).toBe('llm');
    expect(tour.critical_paths).toEqual(full.critical_paths);
    expect(tour.last_attempt).toMatchObject({ skeleton_reason: 'llm_failed', usage: { llm_calls: 1, tokens_in: 10 } });
    expect(mem.stored?.last_attempt?.usage.llm_calls).toBe(1);

    // a later success clears it
    const { service: again } = setup({ repo: mem });
    const fresh = await again.generate(WS, REPO);
    expect(fresh.last_attempt ?? null).toBeNull();
    expect(mem.stored?.last_attempt ?? null).toBeNull();
  });

  it('two concurrent generations make one LLM call; the second gets 409 and the lock is released', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const llm = new FakeLlm(async (req) => {
      await gate;
      return ok()(req);
    });
    const { service } = setup({ llm });
    const a = service.generate(WS, REPO);
    const b = service.generate(WS, REPO);
    expect(await codeOf(b)).toEqual({ code: 'generation_in_progress', statusCode: 409 });
    expect((await service.get(WS, REPO)).status).toBe('generating');
    release();
    await a;
    expect(llm.calls).toHaveLength(1);
    expect((await service.get(WS, REPO)).status).toBe('ready');
    await service.generate(WS, REPO); // lock released
    expect(llm.calls).toHaveLength(2);
  });

  it('releases the lock when generation throws', async () => {
    let n = 0;
    const base = setup();
    const service = new OnboardingService({
      ...(base.service as unknown as { deps: OnboardingServiceDeps }).deps,
      facts: async () => {
        if (n++ === 0) throw new Error('git exploded');
        return FACTS;
      },
    });
    await expect(service.generate(WS, REPO)).rejects.toThrow('git exploded');
    await expect(service.generate(WS, REPO)).resolves.toMatchObject({ mode: 'llm' });
  });

  it('404 outside the workspace, 409 not_cloned for a null path or a missing directory (via cloneExists)', async () => {
    expect(await codeOf(setup({ repo: memRepo({ otherWorkspace: true }) }).service.generate(WS, REPO))).toEqual({ code: 'not_found', statusCode: 404 });
    expect(await codeOf(setup({ repo: memRepo({ clonePath: null }) }).service.generate(WS, REPO))).toEqual({ code: 'not_cloned', statusCode: 409 });
    const gone = setup({ cloneExists: async () => false });
    expect(await codeOf(gone.service.generate(WS, REPO))).toEqual({ code: 'not_cloned', statusCode: 409 });
    expect(gone.llm.calls).toHaveLength(0);
    expect(new ConflictError('x', 'y').statusCode).toBe(409);
  });
});

describe('OnboardingService.get', () => {
  it('makes no LLM call; reports none / ready / not_cloned and index_sha (empty → null)', async () => {
    const s = setup({ indexSha: '' });
    expect(await s.service.get(WS, REPO)).toEqual({ status: 'none', tour: null, index_sha: null });
    await s.service.generate(WS, REPO);
    const calls = s.llm.calls.length;
    const ready = await s.service.get(WS, REPO);
    expect(ready.status).toBe('ready');
    expect(ready.tour?.mode).toBe('llm');
    expect(s.llm.calls).toHaveLength(calls);

    const gone = setup({ cloneExists: async () => false, indexSha: 'abc1234' });
    expect(await gone.service.get(WS, REPO)).toEqual({ status: 'not_cloned', index_sha: 'abc1234' });
    expect(await codeOf(setup({ repo: memRepo({ otherWorkspace: true }) }).service.get(WS, REPO))).toEqual({ code: 'not_found', statusCode: 404 });
  });
});
