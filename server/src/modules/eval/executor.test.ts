import { describe, it, expect, vi } from 'vitest';
import type {
  CompletionResult,
  EvalCaseResult,
  Finding,
  LLMProvider,
  ModelInfo,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { EVAL_MAX_OUTPUT_TOKENS } from './constants.js';
import { EvalExecutor } from './executor.js';
import { synthesizeFrozenDiff } from './frozen-input.js';
import type { EvalExecutorDeps, EvalRunFinish, EvalRunSnapshot, EvalRunnableCase } from './ports.js';

const PATCH = ['@@ -0,0 +1,3 @@', "+const stripe = 'sk_live_TEST123';", '+const b = 2;', '+const c = 3;'].join('\n');

function frozen(path = 'src/config.ts'): string {
  const r = synthesizeFrozenDiff(path, PATCH, { start_line: 1, end_line: 1 });
  if (!r.ok) throw new Error('fixture');
  return r.diff;
}

const finding = (over: Partial<Finding> = {}): Finding => ({
  id: 'f',
  severity: 'CRITICAL',
  category: 'security',
  title: 'Hardcoded key',
  file: 'src/config.ts',
  start_line: 1,
  end_line: 1,
  rationale: 'r',
  confidence: 0.9,
  ...over,
});

const makeCase = (id: string, over: Partial<EvalRunnableCase> = {}): EvalRunnableCase => ({
  id,
  name: `must_find-${id}`,
  inputDiff: frozen(),
  expectation: { type: 'must_find', file: 'src/config.ts', start_line: 1, end_line: 1 },
  meta: {
    source_finding_id: `sf-${id}`,
    source_review_id: 'r',
    repo: 'acme/api',
    pr_number: 482,
    head_sha: 'abc',
    pr_title: 'Add payments',
    pr_body: 'Adds a Stripe client.',
  },
  ...over,
});

/** Fail-fast by default: every call goes through `behaviour`, so no test can reach a real provider. */
class FakeLLM implements LLMProvider {
  readonly id = 'openrouter' as const;
  requests: StructuredRequest<unknown>[] = [];
  constructor(private behaviour: (call: number) => Promise<unknown> | unknown) {}
  async listModels(): Promise<ModelInfo[]> {
    throw new Error('not expected');
  }
  async complete(): Promise<CompletionResult> {
    throw new Error('not expected');
  }
  async embed(): Promise<number[][]> {
    throw new Error('not expected');
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.requests.push(req as StructuredRequest<unknown>);
    const out = (await this.behaviour(this.requests.length)) as { findings: Finding[]; cost: number | null };
    return {
      data: { verdict: 'comment', summary: 's', score: 80, findings: out.findings } as T,
      model: req.model,
      tokensIn: 10,
      tokensOut: 5,
      costUsd: out.cost,
      raw: '{}',
      attempts: 1,
    };
  }
}

interface Harness {
  deps: EvalExecutorDeps;
  progress: number[];
  finished: EvalRunFinish[];
  logs: { level: string; obj: Record<string, unknown>; msg?: string }[];
  llmCalls: string[];
}

function harness(llm: LLMProvider | Error, extra: Partial<EvalExecutorDeps> = {}): Harness {
  const h: Harness = { deps: undefined as never, progress: [], finished: [], logs: [], llmCalls: [] };
  const sink = (level: string) => (obj: unknown, msg?: string) =>
    void h.logs.push({ level, obj: obj as Record<string, unknown>, msg });
  let clock = 1000;
  h.deps = {
    llm: async (provider) => {
      h.llmCalls.push(provider);
      if (llm instanceof Error) throw llm;
      return llm;
    },
    parseDiff: parseUnifiedDiff,
    store: {
      markProgress: async (_id, p) => void h.progress.push(p.casesDone),
      finish: async (_id, o) => void h.finished.push(o),
    },
    log: { info: sink('info'), warn: sink('warn'), error: sink('error'), debug: sink('debug') },
    now: () => (clock += 10),
    correlationId: 'corr-1',
    ...extra,
  };
  return h;
}

const snapshot: EvalRunSnapshot = {
  runId: 'run-1',
  provider: 'openrouter',
  model: 'm',
  systemPrompt: 'You are a reviewer.',
  strategy: 'single-pass',
  skills: [],
};

describe('EvalExecutor', () => {
  it('prompts with the frozen diff and untrusted PR body only: no intent, repo map, callers, context or memory (AC-15)', async () => {
    const llm = new FakeLLM(() => ({ findings: [finding()], cost: 0.002 }));
    const h = harness(llm);
    const results = await new EvalExecutor(h.deps).runSuite(snapshot, [makeCase('c1')]);

    expect(results[0]?.status).toBe('passed');
    const messages = llm.requests[0]!.messages.map((m) => m.content).join('\n');
    expect(messages).toContain('sk_live_TEST123'); // the frozen diff reaches the model...
    expect(messages).toContain('<untrusted source="pr-description">');
    expect(messages).toContain('Review PR #482.');
    // the author-controlled PR title is inside the untrusted PR block, not in the trusted task line
    expect(messages).toMatch(/<untrusted source="pr-description">\nTitle: Add payments/);
    expect(messages).not.toContain('Review PR #482: Add payments');
    expect(llm.requests[0]!.model).toBe('m');
    for (const section of [
      '## PR intent',
      '## Repo skeleton',
      '## Project context',
      '## Callers of changed symbols',
      '## Relevant memory',
      '## Skills / rules',
    ]) {
      expect(messages).not.toContain(section);
    }
  });

  it('includes linked skills when the snapshot has them', async () => {
    const llm = new FakeLLM(() => ({ findings: [], cost: 0 }));
    await new EvalExecutor(harness(llm).deps).runSuite(
      { ...snapshot, skills: [{ name: 'sec', body: 'Check secrets.', trusted: true }] },
      [makeCase('c1')],
    );
    expect(llm.requests[0]!.messages.map((m) => m.content).join('\n')).toContain('## Skills / rules');
  });

  it('records a failing case as error and carries on; the run is completed (AC-20)', async () => {
    const llm = new FakeLLM((call) => {
      if (call === 2) throw new Error('provider 500');
      return { findings: [finding()], cost: 0.01 };
    });
    const h = harness(llm);
    const results = await new EvalExecutor(h.deps).runSuite(snapshot, [makeCase('c1'), makeCase('c2'), makeCase('c3')]);

    expect(results.map((r) => r.status)).toEqual(['passed', 'error', 'passed']);
    // the stored reason is stable; the provider's own text stays in the server log
    expect(results[1]?.error).toBe('provider error');
    expect(JSON.stringify(h.logs)).toContain('provider 500');
    expect(h.progress).toEqual([1, 2, 3]);
    expect(h.finished).toHaveLength(1);
    expect(h.finished[0]).toMatchObject({ status: 'completed' });
    expect(h.finished[0]?.score).toMatchObject({ traces_total: 3, traces_passed: 2, cases_errored: 1, recall: 1 });
    expect(llm.requests).toHaveLength(3); // exactly one review call per case (AC-27, NFR cost)
  });

  it('a missing provider key errors every case with one reason and still completes (D5)', async () => {
    const h = harness(new Error('OPENROUTER_API_KEY is not set'));
    const results = await new EvalExecutor(h.deps).runSuite(snapshot, [makeCase('c1'), makeCase('c2')]);

    expect(h.llmCalls).toEqual(['openrouter']); // resolved once per run
    expect(results.every((r) => r.status === 'error')).toBe(true);
    expect(new Set(results.map((r) => r.error)).size).toBe(1);
    expect(results[0]?.error).toBe('provider unavailable'); // opaque error: no detail stored
    expect(JSON.stringify(h.logs)).toContain('OPENROUTER_API_KEY is not set'); // detail is for the log
    expect(h.finished[0]).toMatchObject({
      status: 'completed',
      score: { cases_errored: 2, recall: null, precision: null, citation_accuracy: null },
    });
  });

  it('ends a hung case as error at the case budget, tells the provider to make one bounded attempt, and the run continues', async () => {
    vi.useFakeTimers();
    try {
      const llm = new FakeLLM((call) => (call === 1 ? new Promise(() => {}) : { findings: [finding()], cost: 0.01 }));
      const h = harness(llm); // default budget: CASE_TIMEOUT_MS = 120 s
      const run = new EvalExecutor(h.deps).runSuite(snapshot, [makeCase('c1'), makeCase('c2')]);
      await vi.advanceTimersByTimeAsync(120_000);
      const results = await run;

      expect(results[0]).toMatchObject({ status: 'error', error: 'case timed out after 120s' });
      expect(results[1]?.status).toBe('passed');
      expect(h.finished[0]).toMatchObject({ status: 'completed', score: { cases_errored: 1 } });
      // the SDK-level bound: one attempt, request timeout = the budget (no SDK retries / re-prompt loop)
      for (const req of llm.requests) {
        expect(req.singleAttempt).toBe(true);
        expect(req.timeoutMs).toBe(120_000);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('maps a provider-side request timeout to the same clear reason', async () => {
    const llm = new FakeLLM(() => {
      throw Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' });
    });
    const [r] = await new EvalExecutor(harness(llm).deps).runSuite(snapshot, [makeCase('c1')]);
    expect(r).toMatchObject({ status: 'error', error: 'case timed out after 120s' });
  });

  it('keeps our own actionable message for a configuration error and maps a schema failure to a stable reason', async () => {
    const { ConfigError } = await import('../../platform/errors.js');
    const missing = harness(new ConfigError('OPENROUTER_API_KEY is not configured'));
    const [a] = await new EvalExecutor(missing.deps).runSuite(snapshot, [makeCase('c1')]);
    expect(a?.error).toBe('provider unavailable: OPENROUTER_API_KEY is not configured');

    const llm = new FakeLLM(() => {
      throw new Error('OpenRouter structured output failed schema validation for Review');
    });
    const [b] = await new EvalExecutor(harness(llm).deps).runSuite(snapshot, [makeCase('c1')]);
    expect(b?.error).toBe('invalid structured output');
  });

  it('every eval review request carries a bounded max_tokens (an unset one makes OpenRouter reserve the full output window)', async () => {
    const llm = new FakeLLM(() => ({ findings: [], cost: 0 }));
    await new EvalExecutor(harness(llm).deps).runSuite(snapshot, [makeCase('c1')]);
    expect(llm.requests[0]!.maxTokens).toBe(EVAL_MAX_OUTPUT_TOKENS);
    expect(EVAL_MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(16_384);
  });

  it('maps credit, key and rate-limit provider errors to stable actionable reasons; the raw text is only logged', async () => {
    const reasonFor = async (err: Error) => {
      const llm = new FakeLLM(() => {
        throw err;
      });
      const h = harness(llm);
      const [r] = await new EvalExecutor(h.deps).runSuite(snapshot, [makeCase('c1')]);
      return { reason: r?.error, logged: JSON.stringify(h.logs) };
    };
    const http = (status: number, message: string) => Object.assign(new Error(message), { status });
    const credits = await reasonFor(http(402, '402 This request requires more credits, or fewer max_tokens. You requested up to 65536 tokens'));
    expect(credits.reason).toBe('provider out of credits');
    expect(credits.logged).toContain('requires more credits'); // detail stays in the server log
    expect((await reasonFor(new Error('402 Insufficient credits'))).reason).toBe('provider out of credits'); // no status property
    expect((await reasonFor(new Error('You have insufficient credits'))).reason).toBe('provider out of credits');
    expect((await reasonFor(http(401, 'No auth credentials found'))).reason).toBe('provider key rejected');
    expect((await reasonFor(http(403, 'forbidden'))).reason).toBe('provider key rejected');
    expect((await reasonFor(http(429, 'slow down'))).reason).toBe('provider rate limited');
    expect((await reasonFor(http(500, 'boom'))).reason).toBe('provider error');
  });

  it('a frozen diff with no files is an error case, not a silent pass', async () => {
    const llm = new FakeLLM(() => ({ findings: [], cost: 0 }));
    const [r] = await new EvalExecutor(harness(llm).deps).runSuite(snapshot, [makeCase('c1', { inputDiff: '' })]);
    expect(r?.status).toBe('error');
    expect(llm.requests).toHaveLength(0);
  });

  it('a hand-written case (no PR number) gets a task line without a PR number', async () => {
    const llm = new FakeLLM(() => ({ findings: [], cost: 0 }));
    const manual = makeCase('m1', { meta: { pr_title: 'stripe-key-leak', pr_body: null } });
    await new EvalExecutor(harness(llm).deps).runSuite(snapshot, [manual]);
    const prompt = llm.requests[0]!.messages.map((m) => m.content).join('\n');
    expect(prompt).toContain('Review the change below.');
    expect(prompt).toMatch(/<untrusted source="pr-description">\nTitle: stripe-key-leak/);
    expect(prompt).not.toContain('Review PR #');
  });

  it('takes no git, GitHub or repo-intel dependency', async () => {
    const llm = new FakeLLM(() => ({ findings: [], cost: null }));
    const h = harness(llm);
    expect(Object.keys(h.deps).sort()).toEqual(['correlationId', 'llm', 'log', 'now', 'parseDiff', 'store']);
    const results: EvalCaseResult[] = await new EvalExecutor(h.deps).runSuite(snapshot, [makeCase('c1')]);
    expect(results[0]?.status).toBe('failed'); // must_find, nothing produced
    expect(h.finished[0]?.score.cost_partial).toBe(true);
  });

  it('logs start, each case and finish under one correlation id and never the diff, PR text or a planted secret', async () => {
    const llm = new FakeLLM((call) => {
      if (call === 2) throw new Error('boom');
      return { findings: [finding({ rationale: 'leaks sk_live_TEST123' })], cost: 0.01 };
    });
    const h = harness(llm);
    await new EvalExecutor(h.deps).runSuite(snapshot, [makeCase('c1'), makeCase('c2')]);

    const events = h.logs.map((l) => l.obj.event);
    expect(events).toEqual(['eval.run.started', 'eval.case.finished', 'eval.case.finished', 'eval.run.finished']);
    expect(h.logs.every((l) => l.obj.correlation_id === 'corr-1' && l.obj.run_id === 'run-1')).toBe(true);
    expect(h.logs.every((l) => typeof l.msg === 'string' && l.msg.length > 0)).toBe(true);
    const blob = JSON.stringify(h.logs);
    expect(blob).not.toContain('sk_live_TEST123');
    expect(blob).not.toContain('Adds a Stripe client');
    expect(blob).not.toContain('You are a reviewer');
    const finish = h.logs.at(-1)!.obj;
    expect(finish).toMatchObject({ traces_total: 2, cases_errored: 1 });
  });
});
