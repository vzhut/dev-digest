import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  AgentEvalCase,
  AgentEvalCaseDetail,
  CreateEvalCaseResponse,
  EvalAgentDashboard,
  EvalRunCompare,
  EvalSuiteRun,
  EvalSuiteRunDetail,
  EvalWorkspaceDashboard,
  RunAllEvalResponse,
  type Finding,
  type LLMProvider,
  type StructuredRequest,
  type StructuredResult,
} from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

// New-file patch: lines 1..6 are inside the one hunk.
const PATCH = [
  '@@ -0,0 +1,6 @@',
  "+const stripe = 'sk_live_FAKE';",
  '+export const a = 1;',
  '+export const b = 2;',
  '+export const c = 3;',
  '+export const d = 4;',
  '+export const e = 5;',
].join('\n');

const PRODUCED: Finding = {
  id: 'p1',
  severity: 'CRITICAL',
  category: 'security',
  title: 'Hardcoded key',
  file: 'src/config.ts',
  start_line: 1,
  end_line: 2,
  rationale: 'r',
  confidence: 0.9,
};

/**
 * Review-shaped fake provider. `gate` holds every call until released (to prove the POST answers
 * before any case finishes); `fail` makes every call throw. Providers a test must not reach get a
 * fail-fast instance so a real key on the dev machine can never turn this into a paid call.
 */
class FakeLlm implements LLMProvider {
  readonly id = 'openrouter' as unknown as LLMProvider['id'];
  calls = 0;
  private release: () => void = () => {};
  gate: Promise<void> | null = null;
  constructor(private opts: { fail?: Error; findings?: Finding[]; hold?: boolean } = {}) {
    if (opts.hold) this.gate = new Promise((resolve) => (this.release = resolve));
  }
  open() {
    this.release();
  }
  async listModels() {
    return [];
  }
  async complete(): Promise<never> {
    throw new Error('unexpected complete()');
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls += 1;
    if (this.gate) await this.gate;
    if (this.opts.fail) throw this.opts.fail;
    const data = { verdict: 'comment', summary: 's', score: 80, findings: this.opts.findings ?? [PRODUCED] };
    return { data: data as T, model: req.model, tokensIn: 10, tokensOut: 5, costUsd: 0.01, raw: '{}', attempts: 1 };
  }
  async embed(): Promise<number[][]> {
    throw new Error('unexpected embed()');
  }
}

/** Any use of the git / GitHub clients is a failure: an eval case must run on its frozen input only (AC-4). */
const forbidden = <T extends object>(what: string) =>
  new Proxy({} as T, {
    get: () => () => {
      throw new Error(`${what} must not be used by an eval run`);
    },
  });

d('eval cases (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;
  const db = () => pg.handle.db;

  const makeApp = (llm?: FakeLlm, extra: { strictIo?: boolean } = {}) =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: db(),
      overrides: {
        git: extra.strictIo ? forbidden<MockGitClient>('git') : new MockGitClient(),
        github: extra.strictIo ? forbidden<MockGitHubClient>('github') : new MockGitHubClient(),
        llm: {
          openrouter: llm ?? new FakeLlm({ fail: new Error('openrouter must not be reached') }),
          openai: new FakeLlm({ fail: new Error('openai must not be reached') }),
          anthropic: new FakeLlm({ fail: new Error('anthropic must not be reached') }),
        },
      },
    });

  beforeAll(async () => {
    pg = await startPg();
    await seed(db());
    workspaceId = (await db().select().from(t.workspaces))[0]!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const newAgent = async (ws = workspaceId) => {
    const [a] = await db()
      .insert(t.agents)
      .values({ workspaceId: ws, name: `eval-agent-${seq++}`, provider: 'openrouter', model: 'm', systemPrompt: 'You review code.' })
      .returning();
    return a!;
  };

  /** A PR with one stored patch for src/config.ts, and a review by `agent` (or none) holding the findings. */
  async function newPullWithReview(opts: { ws?: string; agentId?: string | null; patch?: string | null; file?: string } = {}) {
    const ws = opts.ws ?? workspaceId;
    const [repo] = await db()
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name: `r${seq++}`, fullName: `acme/r${seq}`, clonePath: null })
      .returning();
    const [pull] = await db()
      .insert(t.pullRequests)
      .values({ workspaceId: ws, repoId: repo!.id, number: 482, title: 'Add payments', author: 'a', branch: 'f', base: 'main', headSha: 'sha-1', body: 'Adds a Stripe client.' })
      .returning();
    const file = opts.file ?? 'src/config.ts';
    await db()
      .insert(t.prFiles)
      .values({ prId: pull!.id, path: file, additions: 6, deletions: 0, patch: opts.patch === undefined ? PATCH : opts.patch });
    const [review] = await db()
      .insert(t.reviews)
      .values({ workspaceId: ws, prId: pull!.id, agentId: opts.agentId ?? null, kind: 'review', verdict: 'comment' })
      .returning();
    return { repo: repo!, pull: pull!, review: review! };
  }

  const newFinding = async (
    reviewId: string,
    over: Partial<typeof t.findings.$inferInsert> = {},
  ) => {
    const [f] = await db()
      .insert(t.findings)
      .values({
        reviewId,
        file: 'src/config.ts',
        startLine: 1,
        endLine: 2,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key',
        rationale: 'r',
        confidence: 0.9,
        acceptedAt: new Date(),
        ...over,
      })
      .returning();
    return f!;
  };

  const create = async (app: Awaited<ReturnType<typeof makeApp>>, findingId: string) =>
    app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` });

  it('AC-1/AC-3: an accepted finding becomes one must_find case owned by its agent, frozen with every field', async () => {
    const agent = await newAgent();
    const { pull, review, repo } = await newPullWithReview({ agentId: agent.id });
    const finding = await newFinding(review.id);
    const app = await makeApp();

    const res = await create(app, finding.id);
    expect(res.statusCode).toBe(201);
    const body = CreateEvalCaseResponse.parse(res.json());
    expect(body.created).toBe(true);
    expect(body.case).toMatchObject({
      agent_id: agent.id,
      name: 'must_find-hardcoded-stripe-secret-key',
      expectation: {
        type: 'must_find',
        file: 'src/config.ts',
        start_line: 1,
        end_line: 2,
        label: { title: 'Hardcoded Stripe secret key', category: 'security', severity: 'CRITICAL' },
      },
      meta: {
        source_finding_id: finding.id,
        source_review_id: review.id,
        source_run_id: null,
        repo: `acme/${repo.name}`,
        pr_number: 482,
        head_sha: 'sha-1',
        pr_title: 'Add payments',
        pr_body: 'Adds a Stripe client.',
      },
      input_files: ['src/config.ts'],
      last_result: 'never_run',
    });
    expect(body.case.input_diff).toBe(
      ['diff --git a/src/config.ts b/src/config.ts', '--- a/src/config.ts', '+++ b/src/config.ts', PATCH].join('\n'),
    );

    const [row] = await db().select().from(t.evalCases).where(eq(t.evalCases.id, body.case.id));
    expect(row).toMatchObject({ ownerKind: 'agent', ownerId: agent.id, agentId: agent.id, sourceFindingId: finding.id });

    // AC-3: mutating the source PR and finding afterwards leaves the case untouched.
    await db().update(t.prFiles).set({ patch: '@@ -0,0 +1,1 @@\n+changed' }).where(eq(t.prFiles.prId, pull.id));
    await db().update(t.findings).set({ title: 'Renamed', startLine: 5, dismissedAt: new Date(), acceptedAt: null }).where(eq(t.findings.id, finding.id));
    const again = AgentEvalCaseDetail.parse((await app.inject({ method: 'GET', url: `/eval-cases/${body.case.id}` })).json());
    expect(again).toEqual(body.case);
    await app.close();
  });

  it('AC-2: a dismissed finding becomes a must_not_flag case', async () => {
    const agent = await newAgent();
    const { review } = await newPullWithReview({ agentId: agent.id });
    const finding = await newFinding(review.id, { acceptedAt: null, dismissedAt: new Date(), startLine: 3, endLine: 3, title: 'Style nit' });
    const app = await makeApp();
    const res = await create(app, finding.id);
    expect(res.statusCode).toBe(201);
    expect(CreateEvalCaseResponse.parse(res.json()).case).toMatchObject({
      name: 'must_not_flag-style-nit',
      expectation: { type: 'must_not_flag', start_line: 3, end_line: 3 },
    });
    await app.close();
  });

  it('AC-6: a second create returns the same case with created:false and adds no row', async () => {
    const agent = await newAgent();
    const { review } = await newPullWithReview({ agentId: agent.id });
    const finding = await newFinding(review.id);
    const app = await makeApp();
    const first = CreateEvalCaseResponse.parse((await create(app, finding.id)).json());
    const second = await create(app, finding.id);
    expect(second.statusCode).toBe(200);
    expect(CreateEvalCaseResponse.parse(second.json())).toMatchObject({ created: false, case: { id: first.case.id } });
    expect(await db().select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, finding.id))).toHaveLength(1);
    await app.close();
  });

  it('AC-7/AC-8/AC-9: undecided, agentless, no-patch and out-of-hunk findings are 422 and persist nothing', async () => {
    const agent = await newAgent();
    const app = await makeApp();
    const codeOf = async (findingId: string) => {
      const res = await create(app, findingId);
      expect(res.statusCode).toBe(422);
      return res.json().error.code as string;
    };

    const ok = await newPullWithReview({ agentId: agent.id });
    const undecided = await newFinding(ok.review.id, { acceptedAt: null });
    expect(await codeOf(undecided.id)).toBe('finding_not_triaged');

    const noAgent = await newPullWithReview({ agentId: null });
    expect(await codeOf((await newFinding(noAgent.review.id)).id)).toBe('finding_has_no_agent');

    const deletedAgent = await newAgent();
    const orphan = await newPullWithReview({ agentId: deletedAgent.id });
    const orphanFinding = await newFinding(orphan.review.id);
    await db().delete(t.agents).where(eq(t.agents.id, deletedAgent.id));
    expect(await codeOf(orphanFinding.id)).toBe('finding_has_no_agent');

    const noPatch = await newPullWithReview({ agentId: agent.id, patch: null });
    expect(await codeOf((await newFinding(noPatch.review.id)).id)).toBe('diff_unavailable');

    const outside = await newPullWithReview({ agentId: agent.id });
    expect(await codeOf((await newFinding(outside.review.id, { startLine: 90, endLine: 95 })).id)).toBe(
      'expectation_not_grounded',
    );

    const missingFile = await newPullWithReview({ agentId: agent.id });
    expect(await codeOf((await newFinding(missingFile.review.id, { file: 'src/other.ts' })).id)).toBe('diff_unavailable');

    expect(await db().select().from(t.evalCases).where(eq(t.evalCases.agentId, agent.id))).toHaveLength(0);
    await app.close();
  });

  it('lists an agent’s cases with last result, serves links per PR, and delete removes the case (AC-11/AC-13)', async () => {
    const agent = await newAgent();
    const { pull, review } = await newPullWithReview({ agentId: agent.id });
    const f1 = await newFinding(review.id);
    const f2 = await newFinding(review.id, { acceptedAt: null, dismissedAt: new Date(), startLine: 4, endLine: 4, title: 'Other' });
    const app = await makeApp();
    const c1 = CreateEvalCaseResponse.parse((await create(app, f1.id)).json()).case;
    const c2 = CreateEvalCaseResponse.parse((await create(app, f2.id)).json()).case;

    // An older finished run holds a result for both cases (inserted directly — no LLM involved).
    const result = (case_id: string, status: 'passed' | 'failed') => ({
      case_id, case_name: 'n', status, produced: [], dropped: [], outcomes: [], noise: [], unlabeled: [], cost_usd: null, duration_ms: 1,
    });
    await db().insert(t.evalRuns).values({
      workspaceId, agentId: agent.id, status: 'completed', caseIds: [c1.id, c2.id], tracesTotal: 2, tracesPassed: 1, casesDone: 2,
      results: [result(c1.id, 'passed'), result(c2.id, 'failed')],
    });

    const listed = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json().map((c: unknown) => AgentEvalCase.parse(c));
    expect(Object.fromEntries(listed.map((c: AgentEvalCase) => [c.id, c.last_result]))).toEqual({ [c1.id]: 'passed', [c2.id]: 'failed' });

    const links = (await app.inject({ method: 'GET', url: `/pulls/${pull.id}/eval-case-links` })).json();
    expect(links).toHaveLength(2);
    expect(links).toEqual(expect.arrayContaining([
      { finding_id: f1.id, case_id: c1.id, type: 'must_find' },
      { finding_id: f2.id, case_id: c2.id, type: 'must_not_flag' },
    ]));

    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${c1.id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/eval-cases/${c1.id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${c1.id}` })).statusCode).toBe(404);
    const [run] = await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent.id));
    expect(run!.results?.map((r) => r.case_id)).toContain(c1.id); // AC-13: stored per-case results survive
    expect(run!.caseIds).toContain(c1.id);
    await app.close();
  });

  it('a finding, case, agent or PR of another workspace is 404 on every case endpoint', async () => {
    const [other] = await db().insert(t.workspaces).values({ name: 'other' }).returning();
    const foreignAgent = await newAgent(other!.id);
    const foreign = await newPullWithReview({ ws: other!.id, agentId: foreignAgent.id });
    const foreignFinding = await newFinding(foreign.review.id);
    const [foreignCase] = await db()
      .insert(t.evalCases)
      .values({
        workspaceId: other!.id, ownerKind: 'agent', ownerId: foreignAgent.id, agentId: foreignAgent.id, sourceFindingId: foreignFinding.id,
        name: 'x', inputDiff: 'd', inputFiles: ['a'],
        inputMeta: { source_finding_id: foreignFinding.id, source_review_id: foreign.review.id, repo: 'a/b', pr_number: 1, head_sha: 'h', pr_title: 't' },
        expectedOutput: { type: 'must_find', file: 'a', start_line: 1, end_line: 1 },
      })
      .returning();
    const app = await makeApp();
    for (const [method, url] of [
      ['POST', `/findings/${foreignFinding.id}/eval-case`],
      ['GET', `/eval-cases/${foreignCase!.id}`],
      ['DELETE', `/eval-cases/${foreignCase!.id}`],
      ['GET', `/agents/${foreignAgent.id}/eval-cases`],
      ['GET', `/pulls/${foreign.pull.id}/eval-case-links`],
    ] as const) {
      expect((await app.inject({ method, url })).statusCode, `${method} ${url}`).toBe(404);
    }
    expect(await db().select().from(t.evalCases).where(eq(t.evalCases.id, foreignCase!.id))).toHaveLength(1);
    await app.close();
  });

  it('OQ-14: deleting the agent removes its cases and eval runs', async () => {
    const agent = await newAgent();
    const { review } = await newPullWithReview({ agentId: agent.id });
    const finding = await newFinding(review.id);
    const app = await makeApp();
    const c = CreateEvalCaseResponse.parse((await create(app, finding.id)).json()).case;
    await db().insert(t.evalRuns).values({ workspaceId, agentId: agent.id, status: 'completed', caseIds: [c.id], results: [] });

    expect((await app.inject({ method: 'DELETE', url: `/agents/${agent.id}` })).statusCode).toBe(200);
    expect(await db().select().from(t.evalCases).where(eq(t.evalCases.agentId, agent.id))).toHaveLength(0);
    expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent.id))).toHaveLength(0);
    await app.close();
  });

  // ---- runs ----------------------------------------------------------------

  type App = Awaited<ReturnType<typeof makeApp>>;

  /** An agent with one must_find case (lines 1-2) and one must_not_flag case (line 2), via the real endpoint. */
  async function agentWithTwoCases(app: App) {
    const agent = await newAgent();
    const { review } = await newPullWithReview({ agentId: agent.id });
    const accepted = await newFinding(review.id);
    const dismissed = await newFinding(review.id, { acceptedAt: null, dismissedAt: new Date(), startLine: 2, endLine: 2, title: 'Noisy line' });
    const a = CreateEvalCaseResponse.parse((await create(app, accepted.id)).json()).case;
    const b = CreateEvalCaseResponse.parse((await create(app, dismissed.id)).json()).case;
    return { agent, cases: [a, b] };
  }

  const startRun = (app: App, agentId: string) => app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });

  /** Poll the run row until it is terminal — never a fixed sleep. */
  async function untilTerminal(app: App, runId: string): Promise<EvalSuiteRunDetail> {
    for (let i = 0; i < 200; i += 1) {
      const res = await app.inject({ method: 'GET', url: `/eval-runs/${runId}` });
      const run = EvalSuiteRunDetail.parse(res.json());
      if (run.status !== 'running') return run;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('eval run did not finish');
  }

  it('AC-14/AC-16/AC-18/AC-4: POST answers 202 before any case finishes, a second start is 409, and the finished run records everything — with git and GitHub unusable', async () => {
    const llm = new FakeLlm({ hold: true });
    const app = await makeApp(llm, { strictIo: true });
    const { agent, cases } = await agentWithTwoCases(app);
    const [skill] = await db().select().from(t.skills).limit(1);
    await db().insert(t.agentSkills).values({ agentId: agent.id, skillId: skill!.id, order: 0 });

    const res = await startRun(app, agent.id);
    expect(res.statusCode).toBe(202);
    const { eval_run_id: runId, status } = res.json();
    expect(status).toBe('running');

    // The row is persisted `running` while the (held) LLM has not answered: nothing was awaited.
    const [row] = await db().select().from(t.evalRuns).where(eq(t.evalRuns.id, runId));
    expect(row).toMatchObject({ status: 'running', casesDone: 0, tracesTotal: 2, agentId: agent.id });

    const second = await startRun(app, agent.id);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('eval_run_in_progress');
    expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent.id))).toHaveLength(1);

    llm.open();
    const run = await untilTerminal(app, runId);
    expect(llm.calls).toBe(2); // one review call per case, nothing else

    expect(run).toMatchObject({
      agent_id: agent.id,
      agent_version: 1,
      status: 'completed',
      provider: 'openrouter',
      model: 'm',
      system_prompt: 'You review code.',
      strategy: 'single-pass',
      cases_done: 2,
      cases_errored: 0,
      traces_total: 2,
      traces_passed: 1,
      recall: 1,
      precision: 0.5, // kept 2, one hit on the must_not_flag case
      citation_accuracy: 1,
      cost_partial: false,
    });
    expect(run.cost_usd).toBeCloseTo(0.02, 10);
    expect(run.skills).toEqual([{ id: skill!.id, name: skill!.name, version: skill!.version }]);
    expect([...run.case_ids].sort()).toEqual(cases.map((c) => c.id).sort());
    expect(run.finished_at).not.toBeNull();
    expect(run.duration_ms).not.toBeNull();
    expect(run.results.map((r) => r.status).sort()).toEqual(['failed', 'passed']);

    // after it finished, the agent can run again
    expect((await startRun(app, agent.id)).statusCode).toBe(202);
    await app.close();
  });

  it('AC-19: an agent without cases is 422 no_eval_cases and no run row is written', async () => {
    const app = await makeApp(new FakeLlm());
    const agent = await newAgent();
    const res = await startRun(app, agent.id);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('no_eval_cases');
    expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent.id))).toHaveLength(0);
    await app.close();
  });

  it('AC-20/D5: a failing provider errors every case, the run is still completed with cases_errored and null metrics', async () => {
    const app = await makeApp(new FakeLlm({ fail: new Error('provider 500') }));
    const { agent } = await agentWithTwoCases(app);
    const run = await untilTerminal(app, (await startRun(app, agent.id)).json().eval_run_id);
    expect(run).toMatchObject({
      status: 'completed',
      cases_errored: 2,
      traces_passed: 0,
      recall: null,
      precision: null,
      citation_accuracy: null,
      cost_usd: null,
    });
    expect(run.results.every((r) => r.status === 'error' && r.error === 'provider error')).toBe(true);
    await app.close();
  });

  it('lists runs newest first, compares two runs of one agent (old/new by time) and refuses runs of two agents', async () => {
    const app = await makeApp(new FakeLlm());
    const one = await agentWithTwoCases(app);
    const first = (await startRun(app, one.agent.id)).json().eval_run_id as string;
    await untilTerminal(app, first);
    await db().update(t.agents).set({ systemPrompt: 'You review code.\nBe strict.', version: 2 }).where(eq(t.agents.id, one.agent.id));
    const second = (await startRun(app, one.agent.id)).json().eval_run_id as string;
    await untilTerminal(app, second);

    const listed = (await app.inject({ method: 'GET', url: `/agents/${one.agent.id}/eval-runs` })).json().map((r: unknown) => EvalSuiteRun.parse(r));
    expect(listed.map((r: EvalSuiteRun) => r.id)).toEqual([second, first]);

    // selection order newest-then-oldest still yields old = the earlier run
    const cmp = EvalRunCompare.parse((await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${second}&b=${first}` })).json());
    expect(cmp.old.id).toBe(first);
    expect(cmp.new.id).toBe(second);
    expect(cmp.same_config).toBe(false);
    expect(cmp.prompt_diff.filter((l) => l.op === 'add')).toEqual([{ op: 'add', text: 'Be strict.' }]);
    expect(cmp.case_set).toEqual({ common: 2, added: 0, removed: 0 });

    const other = await agentWithTwoCases(app);
    const otherRun = (await startRun(app, other.agent.id)).json().eval_run_id as string;
    await untilTerminal(app, otherRun);
    const bad = await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${first}&b=${otherRun}` });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe('compare_different_agents');
    await app.close();
  });

  it('agent and workspace dashboards: latest / previous, trend, regression callout and the recent-runs table', async () => {
    const app = await makeApp(new FakeLlm());
    const { agent } = await agentWithTwoCases(app);
    // Two finished runs inserted directly: precision falls 0.9 -> 0.8 (a 0.1 regression).
    const base = { workspaceId, agentId: agent.id, agentVersion: 1, provider: 'openrouter', model: 'm', systemPrompt: 'p', skills: [], caseIds: [], status: 'completed' as const, results: [], tracesTotal: 2, tracesPassed: 2, casesDone: 2 };
    await db().insert(t.evalRuns).values({ ...base, ranAt: new Date('2026-01-01T10:00:00Z'), recall: 1, precision: 0.9, citationAccuracy: 1 });
    await db().insert(t.evalRuns).values({ ...base, ranAt: new Date('2026-01-02T10:00:00Z'), recall: 1, precision: 0.8, citationAccuracy: 1 });

    const dash = EvalAgentDashboard.parse((await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-dashboard` })).json());
    expect(dash).toMatchObject({ cases_total: 2, latest: { precision: 0.8 }, previous: { precision: 0.9 } });
    expect(dash.regression).toHaveLength(1);
    expect(dash.regression[0]!.metric).toBe('precision');
    expect(dash.regression[0]!.drop).toBeCloseTo(0.1, 6);
    expect(dash.trend.map((p) => p.precision)).toEqual([0.9, 0.8]);

    const ws = EvalWorkspaceDashboard.parse((await app.inject({ method: 'GET', url: '/eval/dashboard' })).json());
    const card = ws.cards.find((c) => c.agent_id === agent.id)!;
    expect(card).toMatchObject({ agent_name: agent.name, cases_total: 2, latest_run: { precision: 0.8 } });
    expect(card.trend).toHaveLength(2);
    const mine = ws.recent_runs.filter((r) => r.agent_id === agent.id);
    expect(mine.map((r) => r.precision)).toEqual([0.8, 0.9]);
    expect(mine[0]!.agent_name).toBe(agent.name);
    await app.close();
  });

  it('AC-39: run-all starts every agent with cases and skips one that is already running', async () => {
    const llm = new FakeLlm({ hold: true });
    const app = await makeApp(llm);
    const busy = await agentWithTwoCases(app);
    const idle = await agentWithTwoCases(app);
    const busyRun = (await startRun(app, busy.agent.id)).json().eval_run_id as string;

    const res = await app.inject({ method: 'POST', url: '/eval/run-all' });
    expect(res.statusCode).toBe(200);
    const body = RunAllEvalResponse.parse(res.json());
    expect(body.started).toContain(idle.agent.id);
    expect(body.started).not.toContain(busy.agent.id);
    expect(body.skipped).toContainEqual({ agent_id: busy.agent.id, reason: 'eval_run_in_progress' });

    llm.open();
    await untilTerminal(app, busyRun);
    for (const id of body.started) {
      const [run] = await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, id));
      await untilTerminal(app, run!.id);
    }
    await app.close();
  });

  it('a run left running by a dead process is marked errored (server_restarted) when the API boots', async () => {
    const app0 = await makeApp(new FakeLlm());
    const { agent } = await agentWithTwoCases(app0);
    await app0.close();
    const [orphan] = await db().insert(t.evalRuns).values({ workspaceId, agentId: agent.id, status: 'running', caseIds: [], results: [] }).returning();

    const app = await makeApp(new FakeLlm());
    const [row] = await db().select().from(t.evalRuns).where(eq(t.evalRuns.id, orphan!.id));
    expect(row).toMatchObject({ status: 'errored', errorReason: 'server_restarted' });
    expect(row!.finishedAt).not.toBeNull();
    expect((await startRun(app, agent.id)).statusCode).toBe(202); // no longer blocked by a phantom 409
    await untilTerminal(app, (await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent.id)).orderBy(t.evalRuns.ranAt)).at(-1)!.id);
    await app.close();
  });

  it('a run, agent or compare target of another workspace is 404 on every run endpoint', async () => {
    const [other] = await db().insert(t.workspaces).values({ name: 'other-runs' }).returning();
    const foreignAgent = await newAgent(other!.id);
    const [foreignRun] = await db()
      .insert(t.evalRuns)
      .values({ workspaceId: other!.id, agentId: foreignAgent.id, status: 'completed', caseIds: [], results: [] })
      .returning();
    const app = await makeApp(new FakeLlm());
    const mine = await agentWithTwoCases(app);
    const myRun = (await startRun(app, mine.agent.id)).json().eval_run_id as string;
    await untilTerminal(app, myRun);

    for (const [method, url] of [
      ['POST', `/agents/${foreignAgent.id}/eval-runs`],
      ['GET', `/agents/${foreignAgent.id}/eval-runs`],
      ['GET', `/agents/${foreignAgent.id}/eval-dashboard`],
      ['GET', `/eval-runs/${foreignRun!.id}`],
      ['GET', `/eval-runs/compare?a=${myRun}&b=${foreignRun!.id}`],
    ] as const) {
      expect((await app.inject({ method, url })).statusCode, `${method} ${url}`).toBe(404);
    }
    expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, foreignAgent.id))).toHaveLength(1);
    await app.close();
  });

  it('seed: PR #482 carries decided, agent-attributed findings that all become cases; re-seeding adds nothing; the agent-less review stays newest', async () => {
    const countFindings = async () => (await db().select().from(t.findings)).length;
    const before = await countFindings();
    await seed(db());
    expect(await countFindings()).toBe(before);

    const [pr] = await db().select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    const reviews = (await db().select().from(t.reviews).where(eq(t.reviews.prId, pr!.id))).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    expect(reviews[0]!.agentId).toBeNull(); // the 2-finding review e2e 04 asserts on is still the newest
    const general = reviews.find((r) => r.agentId !== null)!;
    const found = await db().select().from(t.findings).where(eq(t.findings.reviewId, general.id));
    const accepted = found.filter((f) => f.acceptedAt);
    const dismissed = found.filter((f) => f.dismissedAt);
    expect(accepted.length).toBeGreaterThanOrEqual(6);
    expect(dismissed.length).toBeGreaterThanOrEqual(4);
    expect(found.length - accepted.length - dismissed.length).toBe(1);

    const app = await makeApp();
    for (const f of [...accepted, ...dismissed]) {
      expect((await create(app, f.id)).statusCode, f.title).toBe(201);
    }
    await app.close();
  });

  // ---- Amendment 2: case editor, subset runs, last-run detail ---------------

  const MANUAL_DIFF = ['--- a/src/x.ts', '+++ b/src/x.ts', '@@ -0,0 +1,3 @@', '+const a = 1;', '+const b = 2;', '+const c = 3;'].join('\n');
  const manualBody = (over: Record<string, unknown> = {}) => ({
    name: 'stripe-key-leak',
    input_diff: MANUAL_DIFF,
    expectation: { type: 'must_find', file: 'src/x.ts', start_line: 1, end_line: 2, title: 'Leaked key' },
    notes: 'by hand',
    ...over,
  });

  it('AC-43: POST /agents/:id/eval-cases writes a manual case (no source finding, never deduplicated) and validates it', async () => {
    const app = await makeApp();
    const agent = await newAgent();
    const post = (body: unknown, id = agent.id) =>
      app.inject({ method: 'POST', url: `/agents/${id}/eval-cases`, payload: body as object });

    const ok = await post(manualBody());
    expect(ok.statusCode).toBe(201);
    const made = CreateEvalCaseResponse.parse(ok.json());
    expect(made.created).toBe(true);
    expect(made.case).toMatchObject({
      agent_id: agent.id,
      name: 'stripe-key-leak',
      input_files: ['src/x.ts'],
      notes: 'by hand',
      last_result: 'never_run',
      expectation: { type: 'must_find', file: 'src/x.ts', start_line: 1, end_line: 2, label: { title: 'Leaked key' } },
    });
    const [row] = await db().select().from(t.evalCases).where(eq(t.evalCases.id, made.case.id));
    expect(row).toMatchObject({ sourceFindingId: null, ownerKind: 'agent', ownerId: agent.id });
    expect((await post(manualBody())).statusCode).toBe(201); // same payload again: a second case
    expect(await db().select().from(t.evalCases).where(eq(t.evalCases.agentId, agent.id))).toHaveLength(2);

    const code = async (body: unknown) => {
      const res = await post(body);
      expect(res.statusCode).toBe(422);
      return res.json().error.code as string;
    };
    expect(await code(manualBody({ expectation: { type: 'must_find', file: 'src/x.ts', start_line: 40, end_line: 41 } }))).toBe('expectation_not_grounded');
    expect(await code(manualBody({ expectation: { type: 'must_find', file: 'src/other.ts', start_line: 1, end_line: 1 } }))).toBe('expectation_not_grounded');
    expect(await code(manualBody({ expectation: { type: 'must_find', file: 'src/x.ts', start_line: 3, end_line: 1 } }))).toBe('validation_error');
    expect(await code(manualBody({ input_diff: '   ' }))).toBe('diff_unavailable');
    expect(await code(manualBody({ input_diff: 'just some text, not a diff' }))).toBe('diff_unavailable');
    expect(await code(manualBody({ name: '  ' }))).toBe('validation_error');
    expect(await db().select().from(t.evalCases).where(eq(t.evalCases.agentId, agent.id))).toHaveLength(2);

    const [other] = await db().insert(t.workspaces).values({ name: 'other-manual' }).returning();
    const foreign = await newAgent(other!.id);
    expect((await post(manualBody(), foreign.id)).statusCode).toBe(404);
    await app.close();
  });

  it('AC-44: PUT /eval-cases/:id edits a case with the same validation, keeps provenance and earlier run results', async () => {
    const app = await makeApp(new FakeLlm());
    const agent = await newAgent();
    const { review } = await newPullWithReview({ agentId: agent.id });
    const finding = await newFinding(review.id);
    const born = CreateEvalCaseResponse.parse((await create(app, finding.id)).json()).case;
    const put = (id: string, body: unknown) => app.inject({ method: 'PUT', url: `/eval-cases/${id}`, payload: body as object });

    const run = (await startRun(app, agent.id)).json().eval_run_id as string;
    await untilTerminal(app, run);
    const before = (await db().select().from(t.evalRuns).where(eq(t.evalRuns.id, run)))[0]!.results;

    const res = await put(born.id, manualBody({ name: 'renamed', expectation: { type: 'must_not_flag', file: 'src/x.ts', start_line: 2, end_line: 3 } }));
    expect(res.statusCode).toBe(200);
    const edited = AgentEvalCaseDetail.parse(res.json());
    expect(edited).toMatchObject({ name: 'renamed', input_diff: MANUAL_DIFF, expectation: { type: 'must_not_flag', start_line: 2 } });
    expect(edited.meta.source_finding_id).toBe(finding.id); // provenance kept
    expect(edited.meta.pr_title).toBe('Add payments'); // PR meta of a finding-born case is read-only
    const [row] = await db().select().from(t.evalCases).where(eq(t.evalCases.id, born.id));
    expect(row!.sourceFindingId).toBe(finding.id);
    expect((await db().select().from(t.evalRuns).where(eq(t.evalRuns.id, run)))[0]!.results).toEqual(before);

    expect((await put(born.id, manualBody({ input_diff: '' }))).json().error.code).toBe('diff_unavailable');
    expect((await put(born.id, manualBody({ expectation: { type: 'must_find', file: 'src/x.ts', start_line: 99, end_line: 99 } }))).json().error.code).toBe('expectation_not_grounded');
    expect((await app.inject({ method: 'PUT', url: `/eval-cases/${crypto.randomUUID()}`, payload: manualBody() })).statusCode).toBe(404);

    const manual = CreateEvalCaseResponse.parse(
      (await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: manualBody() })).json(),
    ).case;
    const m = AgentEvalCaseDetail.parse((await put(manual.id, manualBody({ pr_title: 'My PR', pr_body: 'body' }))).json());
    expect(m.meta).toMatchObject({ pr_title: 'My PR', pr_body: 'body' });

    const [other] = await db().insert(t.workspaces).values({ name: 'other-put' }).returning();
    const foreignAgent = await newAgent(other!.id);
    const [fc] = await db().insert(t.evalCases).values({
      workspaceId: other!.id, ownerKind: 'agent', ownerId: foreignAgent.id, agentId: foreignAgent.id, name: 'f', inputDiff: MANUAL_DIFF,
      inputMeta: { pr_title: 'x' }, expectedOutput: { type: 'must_find', file: 'src/x.ts', start_line: 1, end_line: 1 },
    }).returning();
    expect((await put(fc!.id, manualBody())).statusCode).toBe(404);
    await app.close();
  });

  it('AC-46/AC-49: a subset run covers only the chosen cases, unknown ids are 422, and each case reports its own last run', async () => {
    const llm = new FakeLlm();
    const app = await makeApp(llm);
    const { agent, cases } = await agentWithTwoCases(app);
    const other = await agentWithTwoCases(app);

    const unknown = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs`, payload: { case_ids: [crypto.randomUUID()] } });
    expect(unknown.statusCode).toBe(422);
    expect(unknown.json().error.code).toBe('unknown_case');
    const foreign = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs`, payload: { case_ids: [other.cases[0]!.id] } });
    expect(foreign.json().error.code).toBe('unknown_case');
    expect((await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs`, payload: { case_ids: ['nope'] } })).statusCode).toBe(422);
    expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent.id))).toHaveLength(0);

    const all = await untilTerminal(app, (await startRun(app, agent.id)).json().eval_run_id);
    expect(all.case_ids).toHaveLength(2);
    const callsAfterAll = llm.calls;

    const sub = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs`, payload: { case_ids: [cases[1]!.id] } });
    expect(sub.statusCode).toBe(202);
    const subRun = await untilTerminal(app, sub.json().eval_run_id);
    expect(subRun).toMatchObject({ case_ids: [cases[1]!.id], traces_total: 1, status: 'completed' });
    expect(llm.calls - callsAfterAll).toBe(1);

    const listed = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json().map((c: unknown) => AgentEvalCase.parse(c));
    const mustFind = listed.find((c: AgentEvalCase) => c.id === cases[0]!.id)!;
    const noise = listed.find((c: AgentEvalCase) => c.id === cases[1]!.id)!;
    expect(mustFind.last_run).toMatchObject({ status: 'passed', findings_total: 1, findings_matched: 1, cost_usd: 0.01 });
    expect(mustFind.last_run!.duration_ms).toBeGreaterThanOrEqual(0);
    expect(noise.last_run).toMatchObject({ status: 'failed', findings_total: 1, findings_matched: 1 });
    expect(noise.last_result).toBe('failed');
    await app.close();
  });

  it('a hostile line range cannot freeze the API: end_line 9e15 is a fast 422 on create and update', async () => {
    const app = await makeApp();
    const agent = await newAgent();
    const created = CreateEvalCaseResponse.parse(
      (await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: manualBody() })).json(),
    ).case;
    const started = performance.now();
    for (const end_line of [9e15, 9007199254740991, 5_000_000]) {
      const body = manualBody({ expectation: { type: 'must_find', file: 'src/x.ts', start_line: 2, end_line } });
      const post = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: body });
      expect(post.statusCode).toBe(422);
      expect((await app.inject({ method: 'PUT', url: `/eval-cases/${created.id}`, payload: body })).statusCode).toBe(422);
    }
    // a hostile hunk header in the diff itself
    const hostileDiff = ['--- a/src/x.ts', '+++ b/src/x.ts', '@@ -1 +1,999999999999 @@'].join('\n');
    const hostile = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: manualBody({ input_diff: hostileDiff }) });
    expect(hostile.statusCode).toBe(422);
    expect(hostile.json().error.code).toBe('diff_unavailable');
    expect(performance.now() - started).toBeLessThan(2000);
    await app.close();
  });

  it('the 200-case cap is atomic: concurrent creates at 199 cases let exactly one through', async () => {
    const app = await makeApp();
    const agent = await newAgent();
    const meta = { pr_title: 'x' };
    const expectation = { type: 'must_find' as const, file: 'src/x.ts', start_line: 1, end_line: 1 };
    await db().insert(t.evalCases).values(
      Array.from({ length: 199 }, (_, i) => ({
        workspaceId, ownerKind: 'agent' as const, ownerId: agent.id, agentId: agent.id, name: `c${i}`, inputDiff: MANUAL_DIFF, inputMeta: meta, expectedOutput: expectation,
      })),
    );
    const results = await Promise.all(
      Array.from({ length: 6 }, () => app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: manualBody() })),
    );
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1);
    const refused = results.filter((r) => r.statusCode === 422);
    expect(refused).toHaveLength(5);
    expect(refused.every((r) => r.json().error.code === 'case_limit_reached')).toBe(true);
    expect(await db().select().from(t.evalCases).where(eq(t.evalCases.agentId, agent.id))).toHaveLength(200);
    await app.close();
  });

  it('each agent card on the dashboard comes from its own runs: a busy agent cannot push another one out of a shared window', async () => {
    const app = await makeApp();
    const quiet = await agentWithTwoCases(app);
    const busy = await agentWithTwoCases(app);
    const base = { workspaceId, agentVersion: 1, provider: 'openrouter', model: 'm', systemPrompt: 'p', skills: [], caseIds: [], status: 'completed' as const, results: [], tracesTotal: 2, tracesPassed: 2, casesDone: 2 };
    await db().insert(t.evalRuns).values({ ...base, agentId: quiet.agent.id, ranAt: new Date('2025-01-01T00:00:00Z'), recall: 0.5, precision: 1, citationAccuracy: 1 });
    await db().insert(t.evalRuns).values(
      Array.from({ length: 250 }, (_, i) => ({ ...base, agentId: busy.agent.id, ranAt: new Date(Date.UTC(2026, 0, 1, 0, i)), recall: 1, precision: 1, citationAccuracy: 1 })),
    );
    const ws = EvalWorkspaceDashboard.parse((await app.inject({ method: 'GET', url: '/eval/dashboard' })).json());
    expect(ws.cards.find((c) => c.agent_id === quiet.agent.id)?.latest_run?.recall).toBe(0.5);
    expect(ws.cards.find((c) => c.agent_id === busy.agent.id)?.trend.length).toBeLessThanOrEqual(20);
    await app.close();
  });
});
