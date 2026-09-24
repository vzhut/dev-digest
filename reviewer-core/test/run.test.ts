import { describe, it, expect } from 'vitest';
import type { LLMProvider, StructuredResult } from '@devdigest/shared';
import { MockLLMProvider, MockGitClient } from '../../server/src/adapters/mocks.js';
import { reviewPullRequest } from '../src/index.js';

/**
 * Engine-level test for reviewPullRequest (the core lifted out of the server's
 * runOneAgent). Uses the server's mock LLM + git so we exercise the real
 * assemble → completeStructured → reduce → grounding pipeline with no DB/SSE.
 */
describe('reviewPullRequest (engine)', () => {
  // One grounded finding (line 11 is in the MockGitClient diff) + one
  // hallucinated finding (line 999) the grounding gate must drop.
  const fixture = {
    verdict: 'request_changes',
    summary: 'secret key committed',
    score: 38,
    findings: [
      {
        id: 'f1',
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key',
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        rationale: 'sk_live in diff',
        confidence: 0.98,
        kind: 'finding',
      },
      {
        id: 'f-hallucinated',
        severity: 'WARNING',
        category: 'bug',
        title: 'phantom finding on a line not in the diff',
        file: 'src/config.ts',
        start_line: 999,
        end_line: 999,
        rationale: 'not real',
        confidence: 0.3,
        kind: 'finding',
      },
    ],
  };

  it('single-pass: assembles, grounds, drops the hallucinated finding', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();

    const events: string[] = [];
    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'gpt-4.1',
      diff,
      llm,
      task: 'Review PR #482',
      onEvent: (e) => events.push(e.msg),
    });

    expect(outcome.mode).toBe('single-pass');
    expect(outcome.grounding).toBe('1/2 passed');
    expect(outcome.review.findings).toHaveLength(1);
    expect(outcome.review.findings[0]!.start_line).toBe(11);
    expect(outcome.dropped).toHaveLength(1);
    // Score is derived from the SURVIVING findings, not the model's self-reported
    // 38: one CRITICAL remains after grounding ⇒ 100 − 35 = 65.
    expect(outcome.review.score).toBe(65);
    // progress is surfaced (server bridges this onto SSE; runner logs it)
    expect(events.some((m) => m.includes('Citation grounding'))).toBe(true);
  });

  it('score is deterministic from findings: a clean approve scores 100', async () => {
    // Model "approves" but reports a nonsense low score (the cheap-model bug).
    // The engine must ignore that and score the zero findings as a perfect 100.
    const clean = { verdict: 'approve', summary: 'looks good', score: 10, findings: [] };
    const llm = new MockLLMProvider('openai', { structured: clean });
    const diff = await new MockGitClient().diff();

    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'deepseek/deepseek-v4-flash',
      diff,
      llm,
      task: 'Review PR #5',
    });

    expect(outcome.review.findings).toHaveLength(0);
    expect(outcome.review.score).toBe(100);
  });

  it('verdict is recomputed after grounding: an all-hallucinated request_changes becomes approve', async () => {
    // The model says request_changes with one CRITICAL, but that finding cites a
    // line outside the diff, so grounding drops it. The persisted verdict must
    // follow the SURVIVING (empty) findings, not the model's stale verdict —
    // otherwise the UI shows a "rejected" badge next to zero findings and a 100 score.
    const hallucinatedOnly = {
      verdict: 'request_changes',
      summary: 'breaking change',
      score: 0,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'bug',
          title: 'cites a line not in the diff',
          file: 'src/config.ts',
          start_line: 999,
          end_line: 999,
          rationale: 'not real',
          confidence: 0.9,
          kind: 'finding',
        },
      ],
    };
    const llm = new MockLLMProvider('openai', { structured: hallucinatedOnly });
    const diff = await new MockGitClient().diff();

    const outcome = await reviewPullRequest({
      systemPrompt: 'api contract reviewer',
      model: 'deepseek/deepseek-v4-flash',
      diff,
      llm,
      task: 'Review PR #4',
    });

    expect(outcome.review.findings).toHaveLength(0);
    expect(outcome.review.verdict).toBe('approve');
    expect(outcome.review.score).toBe(100);
  });

  it('checkCancelled throwing aborts before the LLM call', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();
    await expect(
      reviewPullRequest({
        systemPrompt: 's',
        model: 'gpt-4.1',
        diff,
        llm,
        checkCancelled: () => {
          throw new Error('cancelled');
        },
      }),
    ).rejects.toThrow('cancelled');
  });

  it('forwards sessionId to every LLM call (OpenRouter session grouping)', async () => {
    const seen: (string | undefined)[] = [];
    const recorder: LLMProvider = {
      id: 'openrouter',
      async completeStructured<T>(req): Promise<StructuredResult<T>> {
        seen.push(req.sessionId);
        return {
          data: fixture as unknown as T,
          model: req.model,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          raw: '',
          attempts: 1,
        };
      },
      async listModels() {
        return [];
      },
      async complete() {
        throw new Error('not used');
      },
      async embed() {
        return [];
      },
    };
    const diff = await new MockGitClient().diff();
    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm: recorder, sessionId: 'sess-abc' });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s === 'sess-abc')).toBe(true);
  });
});

describe('reviewPullRequest — intent scope policy', () => {
  const warning = (over: Record<string, unknown> = {}) => ({
    id: 'w1',
    severity: 'WARNING',
    category: 'style',
    title: 'unrelated refactor smell',
    file: 'src/config.ts',
    start_line: 11,
    end_line: 11,
    rationale: 'r',
    confidence: 0.8,
    kind: 'finding',
    scope: 'out_of_scope',
    ...over,
  });
  const intent = {
    intent: { intent: 'Add limiter', in_scope: ['limiter'], out_of_scope: ['config'], risk_areas: [] },
    confidence: 'medium' as const,
    missingContext: [],
  };
  const review = (findings: unknown[]) => ({
    verdict: 'request_changes',
    summary: 's',
    score: 1,
    findings,
  });

  it('out-of-scope WARNING-only review → comment verdict, score recomputed from SUGGESTION', async () => {
    const llm = new MockLLMProvider('openai', { structured: review([warning()]) });
    const diff = await new MockGitClient().diff();
    const events: string[] = [];
    const o = await reviewPullRequest({
      systemPrompt: 's',
      model: 'm',
      diff,
      llm,
      intent,
      onEvent: (e) => events.push(e.msg),
    });
    expect(o.review.findings).toHaveLength(1);
    expect(o.review.findings[0]).toMatchObject({ severity: 'SUGGESTION', original_severity: 'WARNING' });
    expect(o.review.verdict).toBe('comment');
    expect(o.review.score).toBe(97); // one SUGGESTION, not the 88 a WARNING would give
    expect(o.scoped).toEqual({ tagged: 1, downgraded: 1, kept: 0 });
    expect(events.some((m) => m.startsWith('scope: 1 out-of-scope'))).toBe(true);
    expect(o.assembly.intent).toContain('<untrusted source="intent">');
  });

  it('keeps an out-of-scope security CRITICAL (request_changes stays)', async () => {
    const crit = warning({ id: 'c1', severity: 'CRITICAL', category: 'security' });
    const llm = new MockLLMProvider('openai', { structured: review([crit]) });
    const o = await reviewPullRequest({
      systemPrompt: 's',
      model: 'm',
      diff: await new MockGitClient().diff(),
      llm,
      intent,
    });
    expect(o.review.findings[0]).toMatchObject({ severity: 'CRITICAL', original_severity: null });
    expect(o.review.verdict).toBe('request_changes');
    expect(o.review.score).toBe(65);
    expect(o.scoped.kept).toBe(1);
  });

  it('without an intent nothing is downgraded and the prompt has no intent section', async () => {
    const llm = new MockLLMProvider('openai', { structured: review([warning()]) });
    const o = await reviewPullRequest({
      systemPrompt: 's',
      model: 'm',
      diff: await new MockGitClient().diff(),
      llm,
    });
    expect(o.review.findings[0]).toMatchObject({ severity: 'WARNING' });
    expect(o.review.score).toBe(88);
    expect(o.assembly.intent).toBeNull();
  });
});
