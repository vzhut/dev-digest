import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../src/api/client.js';
import { ApiRateLimitError } from '../src/api/errors.js';
import type { ActiveRun, Agent, ReviewRecord, RunSummary } from '../src/api/schemas.js';
import type { Config } from '../src/config.js';
import type { ToolContext, ToolDeps } from '../src/deps.js';
import { ToolError } from '../src/format/errors.js';
import { createResolvers } from '../src/resolve.js';
import { runAgentOnPr } from '../src/tools/run-agent-on-pr.js';
import { makeFindings } from './fixtures/reviews.js';
import { testRunGuard } from './helpers/run-guard.js';

const REPO_ID = '11111111-1111-4111-8111-111111111111';
const AGENT = { id: 'agent-1', name: 'General reviewer', provider: 'openrouter', model: 'm', enabled: true, description: '' } satisfies Agent;
const DISABLED = { ...AGENT, id: 'agent-2', name: 'Security', enabled: false } satisfies Agent;
const ARGS = { repo: 'acme/api', pr: 12, agent: 'General reviewer', wait_seconds: 120 };

interface Opts {
  /** Statuses returned by successive listRuns calls; the last one repeats. */
  statuses?: string[];
  active?: ActiveRun[];
  error?: string | null;
  startReview?: () => Promise<{ runs: { run_id: string; agent_id: string; agent_name: string }[] }>;
  config?: Partial<Config>;
}

function setup(o: Opts = {}) {
  let t = 1_000_000;
  const events: string[] = [];
  let polls = 0;
  const statuses = o.statuses ?? ['running', 'done'];
  const run = (status: string): RunSummary => ({
    run_id: 'run-new',
    agent_id: AGENT.id,
    agent_name: AGENT.name,
    status,
    error: o.error ?? null,
    cost_usd: 0.05,
    grounding: '5/5 passed',
    ran_at: '2026-09-26T10:00:00.000Z',
    score: 80,
    blockers: 1,
  });
  const review: ReviewRecord = {
    id: 'rev-1',
    agent_id: AGENT.id,
    run_id: 'run-new',
    agent_name: AGENT.name,
    kind: 'review',
    verdict: 'request_changes',
    summary: 'sum',
    score: 80,
    grounding: '5/5 passed',
    cost_usd: 0.05,
    created_at: '2026-09-26T10:00:01.000Z',
    findings: makeFindings(5),
  };
  const api = {
    listRepos: vi.fn(async () => [{ id: REPO_ID, full_name: 'acme/api' }]),
    listPulls: vi.fn(async () => [{ id: 'pr-uuid-12', number: 12, title: 'Fix', status: 'needs_review' }]),
    listAgents: vi.fn(async () => [AGENT, DISABLED]),
    getPull: vi.fn(async () => {
      events.push('getPull');
    }),
    activeRuns: vi.fn(async () => o.active ?? []),
    startReview: vi.fn(async () => {
      events.push('startReview');
      return o.startReview ? o.startReview() : { runs: [{ run_id: 'run-new', agent_id: AGENT.id, agent_name: AGENT.name }] };
    }),
    listRuns: vi.fn(async () => {
      const status = statuses[Math.min(polls++, statuses.length - 1)] as string;
      return [run(status)];
    }),
    listReviews: vi.fn(async () => [review]),
  } as unknown as ApiClient & Record<string, ReturnType<typeof vi.fn>>;
  const sleeps: number[] = [];
  const deps: ToolDeps = {
    api,
    resolvers: createResolvers({ api, now: () => t }),
    config: { apiUrl: 'http://localhost:3001', runLimit: 5, runWindowMs: 600_000, pollMs: 3000, ...o.config },
    log: { info() {}, warn() {}, error() {}, debug() {} } as unknown as ToolDeps['log'],
    runGuard: testRunGuard(() => t, { limit: o.config?.runLimit, windowMs: o.config?.runWindowMs }),
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
  };
  const progress = vi.fn(async () => {});
  const ctx: ToolContext = { progress };
  return { api, deps, ctx, progress, events, sleeps, advance: (ms: number) => (t += ms) };
}

const text = (r: { content: { text: string }[] }) => r.content[0]?.text ?? '';
const json = (r: { content: { text: string }[] }) => JSON.parse(text(r)) as Record<string, unknown>;

describe('run_agent_on_pr', () => {
  it('starts exactly one run, primes the PR first, and returns verdict, findings and cost', async () => {
    const { api, deps, ctx, events } = setup();
    const r = await runAgentOnPr(deps, ARGS, ctx);
    expect(r.isError).toBeUndefined();
    expect(api.startReview).toHaveBeenCalledTimes(1);
    expect(api.startReview).toHaveBeenCalledWith('pr-uuid-12', 'agent-1', expect.anything());
    expect(events).toEqual(['getPull', 'startReview']);
    const out = json(r);
    expect(out).toMatchObject({ status: 'done', run_id: 'run-new', verdict: 'request_changes', cost_usd: 0.05, blockers: 1, repo: 'acme/api', pr: 12 });
    expect((out.findings as unknown[]).length).toBe(5);
    expect(out.reused_run).toBeUndefined();
  });

  it('reuses a run already active for the same agent: no new paid run', async () => {
    const { api, deps, ctx } = setup({ active: [{ run_id: 'run-new', agent_id: AGENT.id }] });
    const r = await runAgentOnPr(deps, ARGS, ctx);
    expect(api.startReview).not.toHaveBeenCalled();
    expect(json(r)).toMatchObject({ status: 'done', run_id: 'run-new', reused_run: true });
  });

  it('ignores an active run of another agent', async () => {
    const { api, deps, ctx } = setup({ active: [{ run_id: 'other', agent_id: 'agent-9' }] });
    await runAgentOnPr(deps, ARGS, ctx);
    expect(api.startReview).toHaveBeenCalledTimes(1);
  });

  it('two concurrent identical calls share one POST', async () => {
    const { api, deps, ctx } = setup();
    const [a, b] = await Promise.all([runAgentOnPr(deps, ARGS, ctx), runAgentOnPr(deps, { ...ARGS, repo: 'ACME/api' }, ctx)]);
    expect(api.startReview).toHaveBeenCalledTimes(1);
    expect(json(a).run_id).toBe('run-new');
    expect(json(b).run_id).toBe('run-new');
  });

  it('rate limit: the 6th run inside the window is refused with a wait hint and no POST', async () => {
    const { api, deps, ctx, advance } = setup();
    for (let i = 0; i < 5; i++) {
      expect((await runAgentOnPr(deps, ARGS, ctx)).isError).toBeUndefined();
      advance(1000);
    }
    expect(api.startReview).toHaveBeenCalledTimes(5);
    const r = await runAgentOnPr(deps, ARGS, ctx);
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/^Run limit reached \(5 per 10 min\)\. Wait \d+ s or use get_findings on an existing run\.$/);
    expect(api.startReview).toHaveBeenCalledTimes(5);
  });

  it('maps an API 429 to the same limit message', async () => {
    const { deps, ctx } = setup({
      startReview: async () => {
        throw new ApiRateLimitError(42);
      },
    });
    const r = await runAgentOnPr(deps, ARGS, ctx);
    expect(r.isError).toBe(true);
    expect(text(r)).toBe('Run limit reached (5 per 10 min). Wait 42 s or use get_findings on an existing run.');
  });

  it('a run that never finishes: waits at most wait_seconds, then returns the running shape (not an error)', async () => {
    const { api, deps, ctx, sleeps } = setup({ statuses: ['running'] });
    const r = await runAgentOnPr(deps, { ...ARGS, wait_seconds: 30 }, ctx);
    expect(r.isError).toBeUndefined();
    const out = json(r);
    expect(out).toMatchObject({ status: 'running', run_id: 'run-new', repo: 'acme/api', pr: 12, agent: 'General reviewer' });
    expect(out.next).toBe('retry get_findings with run_id=run-new in ~30s');
    expect(sleeps.reduce((a, b) => a + b, 0)).toBe(30_000);
    expect(api.listReviews).not.toHaveBeenCalled();
  });

  it('wait_seconds 120 still answers by 115 s (before Claude Code auto-backgrounds)', async () => {
    const { deps, ctx, sleeps } = setup({ statuses: ['running'] });
    const r = await runAgentOnPr(deps, { ...ARGS, wait_seconds: 120 }, ctx);
    expect(json(r).status).toBe('running');
    expect(sleeps.reduce((a, b) => a + b, 0)).toBe(115_000);
  });

  it('sends >= 2 progress notifications with strictly increasing progress', async () => {
    const { deps, ctx, progress } = setup({ statuses: ['running', 'running', 'running', 'done'] });
    await runAgentOnPr(deps, ARGS, ctx);
    const values = progress.mock.calls.map((c) => (c as unknown as [{ progress: number }])[0].progress);
    expect(values.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1] as number);
    expect(progress.mock.calls[0] as unknown[]).toEqual([expect.objectContaining({ total: 120 })]);
  });

  it('failed run: isError with the sanitised error and the next step', async () => {
    const { deps, ctx } = setup({ statuses: ['failed'], error: '\u001b[31mbad key\u001b[0m\u0000 for model' });
    const r = await runAgentOnPr(deps, ARGS, ctx);
    expect(r.isError).toBe(true);
    expect(text(r)).toBe("Run run-new failed: bad key for model. Check the agent's model and API key in DevDigest Settings, then call run_agent_on_pr again.");
  });

  it('cancelled run: isError naming run_agent_on_pr', async () => {
    const { deps, ctx } = setup({ statuses: ['cancelled'] });
    const r = await runAgentOnPr(deps, ARGS, ctx);
    expect(r.isError).toBe(true);
    expect(text(r)).toBe('Run run-new was cancelled in the DevDigest UI. Call run_agent_on_pr to start a new one.');
  });

  it('aborted signal: stops waiting, returns the running shape, never cancels the run', async () => {
    const { api, deps, ctx } = setup({ statuses: ['running'] });
    const ac = new AbortController();
    const sleep = deps.sleep;
    let polls = 0;
    deps.sleep = async (ms, s) => {
      if (++polls === 2) ac.abort();
      await sleep(ms, s);
    };
    const r = await runAgentOnPr(deps, ARGS, { ...ctx, signal: ac.signal });
    expect(r.isError).toBeUndefined();
    expect(json(r)).toMatchObject({ status: 'running', run_id: 'run-new' });
    expect(polls).toBe(2);
    expect(Object.keys(api).some((k) => /cancel/i.test(k))).toBe(false);
  });

  it('disabled or unknown agent: isError naming list_agents, no run started', async () => {
    const { api, deps, ctx } = setup();
    const disabled = await runAgentOnPr(deps, { ...ARGS, agent: 'Security' }, ctx).catch((e: unknown) => e);
    expect(disabled).toBeInstanceOf(ToolError);
    expect((disabled as Error).message).toContain('is disabled');
    expect((disabled as Error).message).toContain('list_agents');
    const unknown = await runAgentOnPr(deps, { ...ARGS, agent: 'nope' }, ctx).catch((e: unknown) => e);
    expect((unknown as Error).message).toContain('list_agents');
    expect(api.startReview).not.toHaveBeenCalled();
    expect(api.getPull).not.toHaveBeenCalled();
  });
});
