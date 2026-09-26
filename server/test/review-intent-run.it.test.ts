import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { FakeIntentLLM, setupPr } from './helpers/intent.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,5 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
+  legacyFlag: true,
   redisUrl: x,`;

const finding = (id: string, over: Partial<Review['findings'][number]>): Review['findings'][number] => ({
  id,
  severity: 'WARNING',
  category: 'bug',
  title: id,
  file: 'src/config.ts',
  start_line: 12,
  end_line: 12,
  rationale: 'because',
  confidence: 0.9,
  kind: 'finding',
  ...over,
});

const REVIEW: Review = {
  verdict: 'comment',
  summary: 'ok',
  score: 50,
  findings: [
    finding('drift', { severity: 'WARNING', category: 'style', scope: 'out_of_scope', start_line: 12, end_line: 12 }),
    finding('secret', { severity: 'CRITICAL', category: 'security', scope: 'out_of_scope', start_line: 11, end_line: 11 }),
  ],
};

d('review run × intent layer (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    workspaceId = (await pg.handle.db.select().from(t.workspaces))[0]!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(
    intentLlm: FakeIntentLLM | null,
    agentLlm = new MockLLMProvider('openai', { structured: REVIEW }),
    configOverride: Partial<ReturnType<typeof config>> = {},
  ) {
    return buildApp({
      config: { ...config(), ...configOverride },
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        llm: { openai: agentLlm, ...(intentLlm ? { openrouter: intentLlm } : {}) },
        ...(intentLlm ? {} : { secrets: { get: async () => undefined } }),
      },
    });
  }

  async function runReview(app: Awaited<ReturnType<typeof appWith>>, prId: string) {
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `A-${Math.random()}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId: agent.id } });
    expect(res.statusCode).toBe(200);
    const runs = await waitForPrRuns(pg.handle.db, prId, { expected: 1 });
    const runId = res.json().runs[0].run_id as string;
    // agent_runs turns terminal just BEFORE saveRunTrace; poll until the trace exists.
    let trace: { log: { msg: string }[]; [k: string]: any } = { log: [] };
    for (let i = 0; i < 100; i++) {
      const res = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
      if (res.statusCode === 200) {
        trace = res.json();
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${prId}/reviews` })).json();
    return { runs, trace, review: reviews[0], agentId: agent.id as string };
  }

  it('logs the classifier and the review as two calls, injects the intent, and downgrades only non-critical drift', async () => {
    const intentLlm = new FakeIntentLLM();
    const agentLlm = new MockLLMProvider('openai', { structured: REVIEW });
    const app = await appWith(intentLlm, agentLlm);
    const { pr } = await setupPr(pg.handle.db, workspaceId);

    const { runs, trace, review } = await runReview(app, pr.id);

    const log = trace.log.map((l: { msg: string }) => l.msg);
    const iClassifier = log.findIndex((m: string) => m.startsWith('Intent classifier (openrouter/deepseek/deepseek-v4-flash)'));
    const iReview = log.findIndex((m: string) => m.startsWith('Starting review with agent'));
    expect(iClassifier).toBeGreaterThanOrEqual(0);
    expect(iReview).toBeGreaterThan(iClassifier);
    expect(log.some((m: string) => m.startsWith('intent: sources'))).toBe(true);
    expect(log.some((m: string) => m.startsWith('intent: injected (confidence medium'))).toBe(true);
    expect(log.some((m: string) => m.startsWith('scope: 2 out-of-scope finding(s) tagged, 1 downgraded, 1 kept'))).toBe(true);

    // The intent reaches the reviewer prompt and the trace records it.
    expect(trace.prompt_assembly.intent).toContain('Add rate limiting to public endpoints.');
    expect(trace.tool_calls[0]).toMatchObject({ tool: 'intent_classify', meta: 'fresh' });

    // Out-of-scope WARNING → SUGGESTION (+ original); security CRITICAL untouched; nothing dropped.
    const byTitle = Object.fromEntries(review.findings.map((f: { title: string }) => [f.title, f]));
    expect(review.findings).toHaveLength(2);
    expect(byTitle.drift).toMatchObject({ severity: 'SUGGESTION', original_severity: 'WARNING', scope: 'out_of_scope' });
    expect(byTitle.secret).toMatchObject({ severity: 'CRITICAL', original_severity: null, scope: 'out_of_scope' });
    // Score/verdict are derived from the scoped set (the surviving CRITICAL still blocks).
    expect(review.verdict).toBe('request_changes');

    // Intent cost is NOT an agent_run: one run row, the intent usage lives on pr_intent.
    expect(runs).toHaveLength(1);
    const [row] = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(row!.costUsd).toBeCloseTo(0.00031, 6);
    expect(intentLlm.calls).toHaveLength(1);
    await app.close();
  });

  it('reuses the stored intent on the next run (no second classifier call)', async () => {
    const intentLlm = new FakeIntentLLM();
    const app = await appWith(intentLlm);
    const { pr } = await setupPr(pg.handle.db, workspaceId);
    const { agentId } = await runReview(app, pr.id);
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });
    expect(intentLlm.calls).toHaveLength(1);
    await app.close();
  });

  it('an intent failure never fails the review: it completes without an intent section', async () => {
    const app = await appWith(null);
    const { pr } = await setupPr(pg.handle.db, workspaceId);
    const { runs, trace, review } = await runReview(app, pr.id);

    expect(runs[0]!.status).toBe('done');
    const log = trace.log.map((l: { msg: string }) => l.msg);
    expect(log.some((m: string) => m.startsWith('intent: failed'))).toBe(true);
    expect(log.some((m: string) => m.startsWith('intent: not injected (derivation failed)'))).toBe(true);
    expect(trace.prompt_assembly.intent ?? null).toBeNull();
    // No intent → no scope policy: severities untouched, scope still recorded as informational.
    const drift = review.findings.find((f: { title: string }) => f.title === 'drift');
    expect(drift).toMatchObject({ severity: 'WARNING', original_severity: null });
    await app.close();
  });

  /** Capture every event the run logger publishes (Live Log + pino mirror carry the same data). */
  function captureEvents(app: Awaited<ReturnType<typeof appWith>>) {
    const events: { kind: string; msg: string; data?: any }[] = [];
    const bus = app.container.runBus;
    const original = bus.publish.bind(bus);
    vi.spyOn(bus, 'publish').mockImplementation((runId, kind, msg, data) => {
      events.push({ kind, msg, data });
      return original(runId, kind, msg, data);
    });
    return events;
  }
  const promptEvents = (events: { data?: any }[], name = 'prompt.assembled') =>
    events.filter((e) => e.data?.event === name);

  it('logs prompt assembly as metadata: sections, sources, sizes, model and ONE correlation id for both calls', async () => {
    const app = await appWith(new FakeIntentLLM());
    const events = captureEvents(app);
    const { pr } = await setupPr(pg.handle.db, workspaceId);
    await runReview(app, pr.id);

    const assembled = promptEvents(events);
    const intentCall = assembled.find((e) => e.data.call === 'intent_classifier')!;
    const reviewCall = assembled.find((e) => e.data.call === 'review')!;
    expect(intentCall).toBeDefined();
    expect(reviewCall).toBeDefined();

    // two distinct calls, two models, one request-scoped correlation id
    expect(intentCall.data.model).toBe('openrouter/deepseek/deepseek-v4-flash');
    expect(reviewCall.data.model).toBe('gpt-4.1');
    expect(intentCall.data.correlation_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(reviewCall.data.correlation_id).toBe(intentCall.data.correlation_id);

    // sections: name + source + size, in both prompts
    expect(intentCall.data.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'system', source: 'classifier-prompt' }),
        expect.objectContaining({ name: 'PR title', source: 'pr-author' }),
        expect.objectContaining({ name: 'Changed files', source: 'git-metadata' }),
      ]),
    );
    expect(reviewCall.data.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'system', source: 'agent-prompt' }),
        expect.objectContaining({ name: 'pr_description', source: 'pr-author' }),
        expect.objectContaining({ name: 'intent', source: 'intent-classifier' }),
        expect.objectContaining({ name: 'diff', source: 'git-diff' }),
      ]),
    );
    for (const e of [intentCall, reviewCall]) {
      expect(e.data.total_chars).toBeGreaterThan(0);
      expect(e.data.est_tokens).toBeGreaterThan(0);
      expect(e.data.sections.every((x: { chars: number }) => x.chars > 0)).toBe(true);
    }

    // the run logger's own context carries the correlation id too (pino mirror)
    expect(JSON.stringify(events.filter((e) => e.kind === 'info').map((e) => e.data ?? ''))).toContain(
      intentCall.data.correlation_id,
    );
  });

  it('never logs the diff, the PR body, or any prompt text — with or without verbose mode', async () => {
    for (const verbose of [false, true]) {
      const app = await appWith(new FakeIntentLLM(), undefined, { promptLogVerbose: verbose });
      const events = captureEvents(app);
      const { pr } = await setupPr(pg.handle.db, workspaceId);
      await runReview(app, pr.id);

      const logged = JSON.stringify(
        events.filter((e) => e.data?.event?.startsWith('prompt.assembled') || e.msg.startsWith('prompt')),
      );
      expect(logged.length).toBeGreaterThan(50);
      expect(logged).not.toContain('sk_live_xxx'); // a diff line
      expect(logged).not.toContain('legacyFlag'); // a diff line
      expect(logged).not.toContain('token-bucket rate limiter'); // the PR body
      expect(logged).not.toContain('Add rate limiting to public endpoints'); // the derived intent text
    }
  });

  it('adds the per-section detail event (tokens) only in verbose mode', async () => {
    const off = await appWith(new FakeIntentLLM());
    const offEvents = captureEvents(off);
    await runReview(off, (await setupPr(pg.handle.db, workspaceId)).pr.id);
    expect(promptEvents(offEvents, 'prompt.assembled.detail')).toHaveLength(0);
    expect(promptEvents(offEvents)[0]!.data.sections.some((s: { tokens?: number }) => s.tokens !== undefined)).toBe(false);

    const on = await appWith(new FakeIntentLLM(), undefined, { promptLogVerbose: true });
    const onEvents = captureEvents(on);
    await runReview(on, (await setupPr(pg.handle.db, workspaceId)).pr.id);
    const detail = promptEvents(onEvents, 'prompt.assembled.detail')[0]!;
    expect(detail.kind).toBe('tool'); // debug level on stdout
    expect(detail.data.sections.every((s: { tokens: number }) => typeof s.tokens === 'number')).toBe(true);
  });
});
