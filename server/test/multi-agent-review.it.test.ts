import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { FakeIntentLLM } from './helpers/intent.js';
import type {
  LLMProvider,
  Review,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';

/**
 * Multi-agent review against real Postgres (spec 2026-10-13-multi-agent-review.md):
 * start (AC-11, AC-17), concurrent execution + failure isolation (AC-12/13/29/34),
 * the parent-run read (AC-9/16/18), workspace scoping (AC-42), latest-run endpoints
 * (AC-43/44) and the per-agent estimates (AC-6). The LLM is a controllable fake;
 * concurrency is proven with deferreds, never with timing.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

type Db = PgFixture['handle']['db'];

/** Counts diff loads (AC-12: the diff is prepared once per parent run). */
class CountingGit extends MockGitClient {
  diffCalls = 0;
  override async diff() {
    this.diffCalls += 1;
    return super.diff();
  }
}

/**
 * Fake review LLM. A call to `model` answers immediately with `fixtures[model]`,
 * unless the test `hold()`s that model: then the call blocks until `release()` /
 * `fail()`. `started` lists the models whose call has begun, in order.
 */
class GateLLM implements LLMProvider {
  readonly id = 'openai' as const;
  started: string[] = [];
  private gates = new Map<string, { promise: Promise<void>; resolve: () => void; reject: (e: Error) => void }>();

  constructor(private fixtures: Record<string, Review>) {}

  hold(model: string): void {
    let resolve!: () => void;
    let reject!: (e: Error) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    promise.catch(() => undefined);
    this.gates.set(model, { promise, resolve, reject });
  }
  release(model: string): void {
    this.gates.get(model)!.resolve();
  }
  fail(model: string, err: Error): void {
    this.gates.get(model)!.reject(err);
  }

  async listModels() {
    return [];
  }
  async complete(): Promise<never> {
    throw new Error('not used');
  }
  async embed(): Promise<number[][]> {
    return [];
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.started.push(req.model);
    const gate = this.gates.get(req.model);
    if (gate) await gate.promise;
    const fixture = this.fixtures[req.model];
    if (!fixture) throw new Error(`no fixture for model ${req.model}`);
    return {
      data: req.schema.parse(fixture),
      model: req.model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
      raw: JSON.stringify(fixture),
      attempts: 1,
    };
  }
}

const HALLUCINATED_TITLE = 'Phantom finding on a line not in the diff';

function review(findings: Partial<Review['findings'][number]>[]): Review {
  return {
    verdict: 'comment',
    summary: 'fixture review',
    score: 70,
    findings: findings.map((f, i) => ({
      id: `fx-${i}-${f.title ?? ''}`,
      severity: 'WARNING',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      confidence: 0.9,
      kind: 'finding',
      ...f,
    })) as Review['findings'],
  };
}

async function until(check: () => boolean | Promise<boolean>, what: string, timeoutMs = 15_000) {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 15));
  }
}

let repoSeq = 0;
async function setupRepoAndPr(db: Db, workspaceId: string) {
  const name = `ma-api-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting.',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

let agentSeq = 0;
async function createAgent(
  db: Db,
  workspaceId: string,
  opts: { name?: string; model?: string; enabled?: boolean } = {},
) {
  const n = agentSeq++;
  const [agent] = await db
    .insert(t.agents)
    .values({
      workspaceId,
      name: opts.name ?? `Agent ${n}`,
      provider: 'openai',
      model: opts.model ?? `model-${n}`,
      systemPrompt: 'review',
      enabled: opts.enabled ?? true,
    })
    .returning();
  return agent!;
}

async function createWorkspace(db: Db): Promise<string> {
  const [ws] = await db.insert(t.workspaces).values({ name: `Other ${repoSeq++}` }).returning();
  return ws!.id;
}

d('multi-agent review (Testcontainers pg)', () => {
  let pg: PgFixture;
  let db: Db;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces);
    workspaceId = ws!.id;
    // Seeded agents would be picked up by {all:true} / the estimates read and talk to
    // real providers; only agents created by a test stay enabled.
    await db.update(t.agents).set({ enabled: false }).where(eq(t.agents.workspaceId, workspaceId));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(llm: LLMProvider, git = new CountingGit({ diff: DIFF })) {
    return buildApp({
      config: config(),
      db,
      overrides: {
        embedder: new MockEmbedder(),
        git,
        llm: {
          openai: llm,
          // Fail-soft intent classifier, stubbed so no test reaches a real provider.
          openrouter: new FakeIntentLLM(undefined, new Error('intent classifier disabled in this test')),
        },
      },
    });
  }

  const childRuns = (multiAgentRunId: string) =>
    db.select().from(t.agentRuns).where(eq(t.agentRuns.multiAgentRunId, multiAgentRunId));
  const parentRow = async (id: string) =>
    (await db.select().from(t.multiAgentRuns).where(eq(t.multiAgentRuns.id, id)))[0]!;
  const parentFinished = (id: string) => async () => (await parentRow(id)).finishedAt !== null;
  const runsOfPr = (prId: string) => db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, prId));
  const parentsOfPr = (prId: string) =>
    db.select().from(t.multiAgentRuns).where(eq(t.multiAgentRuns.prId, prId));

  // ===========================================================================
  describe('POST /pulls/:id/review', () => {
    it('agent_ids creates a parent + linked children with the agent name, returns ids at once, and runs duplicates once', async () => {
      const llm = new GateLLM({});
      const a = await createAgent(db, workspaceId, { name: 'Security', model: 'm-sec' });
      const b = await createAgent(db, workspaceId, { name: 'Performance', model: 'm-perf' });
      llm.hold('m-sec');
      llm.hold('m-perf');
      const app = await appWith(llm);
      const { pr } = await setupRepoAndPr(db, workspaceId);

      const res = await app.inject({
        method: 'POST',
        url: `/pulls/${pr.id}/review`,
        payload: { agent_ids: [a.id, b.id, a.id] },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.pr_id).toBe(pr.id);
      expect(body.reviews).toEqual([]);
      expect(body.runs).toEqual([
        { run_id: expect.any(String), agent_id: a.id, agent_name: 'Security' },
        { run_id: expect.any(String), agent_id: b.id, agent_name: 'Performance' },
      ]);
      expect(typeof body.multi_agent_run_id).toBe('string');

      // Responded before any agent finished: both LLM calls are still blocked.
      const children = await childRuns(body.multi_agent_run_id);
      expect(await parentsOfPr(pr.id)).toHaveLength(1);
      expect(children.map((c) => c.id).sort()).toEqual(body.runs.map((r: { run_id: string }) => r.run_id).sort());
      expect(Object.fromEntries(children.map((c) => [c.agentId, c.agentName]))).toEqual({
        [a.id]: 'Security',
        [b.id]: 'Performance',
      });
      expect(children.every((c) => c.status === 'running' && c.workspaceId === workspaceId && c.prId === pr.id)).toBe(true);

      llm.fail('m-sec', new Error('stop'));
      llm.fail('m-perf', new Error('stop'));
      await until(parentFinished(body.multi_agent_run_id), 'parent finished');
      await app.close();
    });

    it('keeps {agentId} and {all:true} working: no parent run and no multi_agent_run_id key', async () => {
      const one = await createAgent(db, workspaceId, { name: 'Solo', model: 'm-solo' });
      const llm = new GateLLM({ 'm-solo': review([{}]) });
      const app = await appWith(llm);
      const { pr } = await setupRepoAndPr(db, workspaceId);

      const single = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: one.id } });
      expect(single.statusCode).toBe(200);
      expect(single.json()).not.toHaveProperty('multi_agent_run_id');
      expect(single.json().runs).toHaveLength(1);
      await until(async () => (await runsOfPr(pr.id)).every((r) => r.status !== 'running'), 'single run settled');

      // {all:true} -> every enabled agent of the workspace. Disable the others so only `one` runs.
      const others = await db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
      const otherIds = others.filter((x) => x.id !== one.id && x.enabled).map((x) => x.id);
      if (otherIds.length > 0) await db.update(t.agents).set({ enabled: false }).where(inArray(t.agents.id, otherIds));
      const all = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { all: true } });
      expect(all.statusCode).toBe(200);
      expect(all.json()).not.toHaveProperty('multi_agent_run_id');
      expect(all.json().runs).toHaveLength(1);
      await until(async () => (await runsOfPr(pr.id)).filter((r) => r.status !== 'running').length === 2, 'both runs settled');

      expect(await parentsOfPr(pr.id)).toEqual([]);
      expect((await runsOfPr(pr.id)).every((r) => r.multiAgentRunId === null)).toBe(true);
      // restore: later tests create their own enabled agents; the disabled ones stay disabled.
      await db.update(t.agents).set({ enabled: false }).where(eq(t.agents.id, one.id));
      await app.close();
    });

    it('rejects bad agent_ids with 400 invalid_run_request and writes nothing', async () => {
      const llm = new GateLLM({});
      const a = await createAgent(db, workspaceId);
      const app = await appWith(llm);
      const { pr } = await setupRepoAndPr(db, workspaceId);
      const distinctEleven = Array.from({ length: 11 }, (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`);

      const bodies: Record<string, unknown> = {
        'empty list': { agent_ids: [] },
        'more than 10 distinct': { agent_ids: distinctEleven },
        'mixed with agentId': { agent_ids: [a.id], agentId: a.id },
        'mixed with all': { agent_ids: [a.id], all: true },
      };
      for (const [label, payload] of Object.entries(bodies)) {
        const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload });
        expect(res.statusCode, label).toBe(400);
        expect(res.json().error.code, label).toBe('invalid_run_request');
      }
      expect(await parentsOfPr(pr.id)).toEqual([]);
      expect(await runsOfPr(pr.id)).toEqual([]);
      expect(llm.started).toEqual([]);
      await app.close();
    });

    it('answers 404 for a foreign / unknown agent id or a foreign PR, with no parent or child written', async () => {
      const llm = new GateLLM({});
      const mine = await createAgent(db, workspaceId);
      const otherWs = await createWorkspace(db);
      const foreignAgent = await createAgent(db, otherWs);
      const { pr } = await setupRepoAndPr(db, workspaceId);
      const { pr: foreignPr } = await setupRepoAndPr(db, otherWs);
      const app = await appWith(llm);

      const foreign = await app.inject({
        method: 'POST',
        url: `/pulls/${pr.id}/review`,
        payload: { agent_ids: [mine.id, foreignAgent.id] },
      });
      expect(foreign.statusCode).toBe(404);
      const unknown = await app.inject({
        method: 'POST',
        url: `/pulls/${pr.id}/review`,
        payload: { agent_ids: [mine.id, '00000000-0000-4000-8000-000000000000'] },
      });
      expect(unknown.statusCode).toBe(404);
      const foreignPull = await app.inject({
        method: 'POST',
        url: `/pulls/${foreignPr.id}/review`,
        payload: { agent_ids: [mine.id] },
      });
      expect(foreignPull.statusCode).toBe(404);

      expect(await parentsOfPr(pr.id)).toEqual([]);
      expect(await runsOfPr(pr.id)).toEqual([]);
      expect(await parentsOfPr(foreignPr.id)).toEqual([]);
      expect(await runsOfPr(foreignPr.id)).toEqual([]);
      await app.close();
    });
  });

  // ===========================================================================
  describe('concurrent execution and failure isolation', () => {
    it('runs three agents at once; one throwing leaves the others done, the parent finished and partial', async () => {
      const a = await createAgent(db, workspaceId, { name: 'Alpha', model: 'm-alpha' });
      const b = await createAgent(db, workspaceId, { name: 'Bravo', model: 'm-bravo' });
      const c = await createAgent(db, workspaceId, { name: 'Charlie', model: 'm-charlie' });
      const git = new CountingGit({ diff: DIFF });
      const llm = new GateLLM({
        'm-alpha': review([
          { severity: 'CRITICAL', title: 'Hardcoded Stripe secret key' },
          { severity: 'WARNING', category: 'bug', title: HALLUCINATED_TITLE, start_line: 999, end_line: 999 },
        ]),
        'm-charlie': review([{ severity: 'WARNING', title: 'Live Stripe key committed' }]),
      });
      for (const m of ['m-alpha', 'm-bravo', 'm-charlie']) llm.hold(m);
      const app = await appWith(llm, git);
      const { pr } = await setupRepoAndPr(db, workspaceId);

      const res = await app.inject({
        method: 'POST',
        url: `/pulls/${pr.id}/review`,
        payload: { agent_ids: [a.id, b.id, c.id] },
      });
      const parentId: string = res.json().multi_agent_run_id;

      // All three reviews are in flight before any one is released: they overlap.
      await until(() => llm.started.length === 3, 'three concurrent LLM calls');
      expect([...llm.started].sort()).toEqual(['m-alpha', 'm-bravo', 'm-charlie']);
      expect((await childRuns(parentId)).every((r) => r.status === 'running')).toBe(true);
      expect((await parentRow(parentId)).finishedAt).toBeNull();
      expect(git.diffCalls).toBe(1);

      llm.release('m-alpha');
      llm.fail('m-bravo', new Error('provider exploded'));
      llm.release('m-charlie');
      await until(parentFinished(parentId), 'parent finished');

      const byAgent = Object.fromEntries((await childRuns(parentId)).map((r) => [r.agentName, r]));
      expect(byAgent.Alpha).toMatchObject({ status: 'done', findingsCount: 1, grounding: '1/2 passed' });
      expect(byAgent.Charlie).toMatchObject({ status: 'done', findingsCount: 1 });
      expect(byAgent.Bravo).toMatchObject({ status: 'failed' });
      expect(byAgent.Bravo!.error).toContain('provider exploded');

      const parent = await parentRow(parentId);
      expect(parent.finishedAt).not.toBeNull();
      expect(parent.durationMs).toBeGreaterThanOrEqual(0);

      // AC-29: the dropped finding and WHY is persisted in the trace of the run that lost it.
      const traceA = (await app.inject({ method: 'GET', url: `/runs/${byAgent.Alpha!.id}/trace` })).json();
      expect(traceA.grounding_dropped).toHaveLength(1);
      expect(traceA.grounding_dropped[0]).toMatchObject({ title: HALLUCINATED_TITLE, file: 'src/config.ts', start_line: 999, end_line: 999 });
      expect(traceA.grounding_dropped[0].reason).toContain('999');
      const traceC = (await app.inject({ method: 'GET', url: `/runs/${byAgent.Charlie!.id}/trace` })).json();
      expect(traceC).not.toHaveProperty('grounding_dropped');
      // The failed run keeps a trace too, so "View trace" works for its column.
      expect((await app.inject({ method: 'GET', url: `/runs/${byAgent.Bravo!.id}/trace` })).statusCode).toBe(200);

      // The parent read: derived status, columns in creation order, grouped + conflicted.
      const read = (await app.inject({ method: 'GET', url: `/multi-agent-runs/${parentId}` })).json();
      expect(read).toMatchObject({ id: parentId, status: 'partial', agent_count: 3, pr_number: 482, pr_title: 'Add rate limiting' });
      expect(read.total_duration_ms).toBe(parent.durationMs);
      expect(read.columns.map((col: { agent_name: string; status: string }) => [col.agent_name, col.status])).toEqual([
        ['Alpha', 'done'],
        ['Bravo', 'failed'],
        ['Charlie', 'done'],
      ]);
      expect(read.columns[1].error).toContain('provider exploded');
      expect(read.columns[0].findings).toHaveLength(1);
      expect(read.total_cost_usd).toBeCloseTo(0.002, 6); // Bravo's cost is unknown (null), not 0
      expect(read.conflicts).toHaveLength(1);
      expect(read.conflicts[0].members.map((m: { agent_name: string }) => m.agent_name)).toEqual(['Alpha', 'Charlie']);
      expect(read.conflicts[0].takes.map((tk: { persona: string; verdict: string }) => [tk.persona, tk.verdict])).toEqual([
        ['Alpha', 'CRITICAL'],
        ['Bravo', 'failed'],
        ['Charlie', 'WARNING'],
      ]);
      expect(read.conflicts[0].is_conflict).toBe(true);
      await app.close();
    });

    it('a parent whose every child failed is failed and still finished', async () => {
      const a = await createAgent(db, workspaceId, { name: 'Doomed A', model: 'm-da' });
      const b = await createAgent(db, workspaceId, { name: 'Doomed B', model: 'm-db' });
      const llm = new GateLLM({}); // no fixtures: every call throws
      const app = await appWith(llm);
      const { pr } = await setupRepoAndPr(db, workspaceId);

      const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agent_ids: [a.id, b.id] } });
      const parentId: string = res.json().multi_agent_run_id;
      await until(parentFinished(parentId), 'parent finished');

      const read = (await app.inject({ method: 'GET', url: `/multi-agent-runs/${parentId}` })).json();
      expect(read.status).toBe('failed');
      expect(read.columns.map((c: { status: string }) => c.status)).toEqual(['failed', 'failed']);
      expect(read.conflicts).toEqual([]);
      expect(read.total_cost_usd).toBeNull();
      await app.close();
    });

    it('cancelling one child through POST /runs/:id/cancel ends only that child cancelled while its sibling finishes done', async () => {
      const a = await createAgent(db, workspaceId, { name: 'Keeps going', model: 'm-keep' });
      const b = await createAgent(db, workspaceId, { name: 'Gets cancelled', model: 'm-cancel' });
      const llm = new GateLLM({ 'm-keep': review([{}]), 'm-cancel': review([{ title: 'Late finding' }]) });
      llm.hold('m-keep');
      llm.hold('m-cancel');
      const app = await appWith(llm);
      const { pr } = await setupRepoAndPr(db, workspaceId);

      const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agent_ids: [a.id, b.id] } });
      const parentId: string = res.json().multi_agent_run_id;
      const cancelId = res.json().runs[1].run_id;
      const keepId = res.json().runs[0].run_id;
      await until(() => llm.started.length === 2, 'both calls in flight');

      const cancel = await app.inject({ method: 'POST', url: `/runs/${cancelId}/cancel` });
      expect(cancel.statusCode).toBe(200);
      const statusOf = async (id: string) => (await db.select().from(t.agentRuns).where(eq(t.agentRuns.id, id)))[0]!.status;
      expect(await statusOf(cancelId)).toBe('cancelled');
      expect(await statusOf(keepId)).toBe('running');

      llm.release('m-keep');
      llm.release('m-cancel');
      await until(parentFinished(parentId), 'parent finished');

      expect(await statusOf(keepId)).toBe('done');
      expect(await statusOf(cancelId)).toBe('cancelled');
      const read = (await app.inject({ method: 'GET', url: `/multi-agent-runs/${parentId}` })).json();
      expect(read.status).toBe('partial');
      await app.close();
    });
  });

  // ===========================================================================
  describe('GET /multi-agent-runs/:id (parent read)', () => {
    async function insertParent(prId: string, opts: { ranAt?: Date; durationMs?: number | null; workspaceId?: string } = {}) {
      const [row] = await db
        .insert(t.multiAgentRuns)
        .values({
          workspaceId: opts.workspaceId ?? workspaceId,
          prId,
          ...(opts.ranAt ? { ranAt: opts.ranAt } : {}),
          durationMs: opts.durationMs ?? null,
        })
        .returning();
      return row!;
    }
    let tick = 0;
    async function insertChild(
      parentId: string,
      prId: string,
      opts: {
        agentId?: string | null;
        agentName?: string | null;
        status?: string | null;
        durationMs?: number | null;
        costUsd?: number | null;
      } = {},
    ) {
      tick += 1;
      const [row] = await db
        .insert(t.agentRuns)
        .values({
          workspaceId,
          prId,
          multiAgentRunId: parentId,
          agentId: opts.agentId ?? null,
          agentName: opts.agentName ?? null,
          status: 'status' in opts ? opts.status! : 'done',
          durationMs: opts.durationMs ?? null,
          costUsd: opts.costUsd ?? null,
          ranAt: new Date(Date.UTC(2026, 9, 14, 10, 0, tick)),
        })
        .returning();
      return row!;
    }
    async function insertReviewFor(runId: string, prId: string) {
      const [rv] = await db
        .insert(t.reviews)
        .values({ workspaceId, prId, runId, kind: 'review', verdict: 'comment', summary: 's', score: 80 })
        .returning();
      return rv!.id;
    }
    async function insertFinding(reviewId: string, f: { title: string; line: number; severity?: string; category?: string }) {
      const [fn] = await db
        .insert(t.findings)
        .values({
          reviewId,
          file: 'src/config.ts',
          startLine: f.line,
          endLine: f.line,
          severity: f.severity ?? 'WARNING',
          category: f.category ?? 'bug',
          title: f.title,
          rationale: `why ${f.title}`,
          confidence: 0.8,
        })
        .returning();
      return fn!;
    }

    it('derives total_duration_ms: stored value wins, else the slowest child once none is running, else null', async () => {
      const app = await appWith(new GateLLM({}));
      const { pr } = await setupRepoAndPr(db, workspaceId);
      const read = async (id: string) => (await app.inject({ method: 'GET', url: `/multi-agent-runs/${id}` })).json();

      const stored = await insertParent(pr.id, { durationMs: 5000 });
      await insertChild(stored.id, pr.id, { durationMs: 1000 });
      await insertChild(stored.id, pr.id, { durationMs: 3000 });
      expect((await read(stored.id)).total_duration_ms).toBe(5000);

      const reaped = await insertParent(pr.id); // never finished (e.g. server restart)
      await insertChild(reaped.id, pr.id, { durationMs: 1000, costUsd: 0.01 });
      await insertChild(reaped.id, pr.id, { durationMs: 3000, costUsd: null });
      await insertChild(reaped.id, pr.id, { status: 'failed', durationMs: 2000 });
      const reapedRead = await read(reaped.id);
      expect(reapedRead.total_duration_ms).toBe(3000);
      expect(reapedRead.total_cost_usd).toBeCloseTo(0.01, 10); // sums known costs only
      expect(reapedRead.columns.map((c: { cost_usd: number | null }) => c.cost_usd)).toEqual([0.01, null, null]);

      const live = await insertParent(pr.id);
      await insertChild(live.id, pr.id, { durationMs: 1000 });
      await insertChild(live.id, pr.id, { status: 'running' });
      const liveRead = await read(live.id);
      expect(liveRead.total_duration_ms).toBeNull();
      expect(liveRead.status).toBe('running');

      const noDurations = await insertParent(pr.id);
      await insertChild(noDurations.id, pr.id, { status: 'failed', durationMs: null });
      expect((await read(noDurations.id)).total_duration_ms).toBeNull();
      await app.close();
    });

    it('names columns from the stored agent name, falls back to the live agent, then "Unknown agent"; unknown statuses read as failed', async () => {
      const app = await appWith(new GateLLM({}));
      const { pr } = await setupRepoAndPr(db, workspaceId);
      const renamed = await createAgent(db, workspaceId, { name: 'New name' });
      const live = await createAgent(db, workspaceId, { name: 'Live name' });
      const parent = await insertParent(pr.id);
      await insertChild(parent.id, pr.id, { agentId: renamed.id, agentName: 'Name at run time' });
      await insertChild(parent.id, pr.id, { agentId: live.id, agentName: null });
      await insertChild(parent.id, pr.id, { agentId: null, agentName: null, status: null });

      const read = (await app.inject({ method: 'GET', url: `/multi-agent-runs/${parent.id}` })).json();
      expect(read.columns.map((c: { agent_name: string; agent_id: string; status: string }) => [c.agent_name, c.agent_id, c.status])).toEqual([
        ['Name at run time', renamed.id, 'done'],
        ['Live name', live.id, 'done'],
        ['Unknown agent', '', 'failed'],
      ]);
      await app.close();
    });

    it('groups persisted findings across agents without modifying a single finding row', async () => {
      const app = await appWith(new GateLLM({}));
      const { pr } = await setupRepoAndPr(db, workspaceId);
      const parent = await insertParent(pr.id);
      const c1 = await insertChild(parent.id, pr.id, { agentName: 'One' });
      const c2 = await insertChild(parent.id, pr.id, { agentName: 'Two' });
      const rv1 = await insertReviewFor(c1.id, pr.id);
      const rv2 = await insertReviewFor(c2.id, pr.id);
      const f1 = await insertFinding(rv1, { title: 'Retry-After header omitted on 429', line: 52, category: 'api' });
      const f2 = await insertFinding(rv2, { title: 'Missing Retry-After on 429 responses', line: 52, category: 'api' });
      const f3 = await insertFinding(rv1, { title: 'Pipeline INCR and EXPIRE are not atomic', line: 27, category: 'bug' });
      const ids = [f1.id, f2.id, f3.id];
      const snapshot = () => db.select().from(t.findings).where(inArray(t.findings.id, ids)).orderBy(t.findings.id);
      const before = await snapshot();

      const read = (await app.inject({ method: 'GET', url: `/multi-agent-runs/${parent.id}` })).json();
      expect(read.conflicts.map((g: { line: number; members: unknown[] }) => [g.line, g.members.length])).toEqual([
        [27, 1],
        [52, 2],
      ]);
      const pair = read.conflicts[1];
      expect(pair.members.map((m: { finding_id: string; agent_name: string; title: string }) => [m.finding_id, m.agent_name, m.title])).toEqual([
        [f1.id, 'One', 'Retry-After header omitted on 429'],
        [f2.id, 'Two', 'Missing Retry-After on 429 responses'],
      ]);
      expect(pair.is_conflict).toBe(false);
      // The single-member group is a conflict: agent Two completed without flagging it.
      expect(read.conflicts[0].is_conflict).toBe(true);
      expect(read.columns[0].findings.map((f: { id: string }) => f.id).sort()).toEqual([f1.id, f3.id].sort());

      expect(await snapshot()).toEqual(before);
      await app.close();
    });

    it('answers 404 for another workspace\'s parent run and for an unknown id', async () => {
      const app = await appWith(new GateLLM({}));
      const otherWs = await createWorkspace(db);
      const { pr: foreignPr } = await setupRepoAndPr(db, otherWs);
      const foreign = await insertParent(foreignPr.id, { workspaceId: otherWs });

      const res = await app.inject({ method: 'GET', url: `/multi-agent-runs/${foreign.id}` });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('not_found');
      expect((await app.inject({ method: 'GET', url: '/multi-agent-runs/00000000-0000-4000-8000-000000000000' })).statusCode).toBe(404);
      await app.close();
    });

    // -------------------------------------------------------------------------
    it('latest endpoints return null when none, else the newest by ran_at, never another repo\'s or workspace\'s', async () => {
      const app = await appWith(new GateLLM({}));
      const { repo, pr } = await setupRepoAndPr(db, workspaceId);
      const { pr: otherPrSameWs } = await setupRepoAndPr(db, workspaceId); // another repo, same workspace
      const otherWs = await createWorkspace(db);
      const { repo: foreignRepo, pr: foreignPr } = await setupRepoAndPr(db, otherWs);
      const latestRepo = async (id: string) => (await app.inject({ method: 'GET', url: `/repos/${id}/multi-agent-runs/latest` })).json();
      const latestPr = async (id: string) => (await app.inject({ method: 'GET', url: `/pulls/${id}/multi-agent-runs/latest` })).json();

      expect(await latestRepo(repo.id)).toEqual({ id: null });
      expect(await latestPr(pr.id)).toEqual({ id: null });

      // Inserted newest-first on purpose: the answer must follow ran_at, not insertion order.
      const newest = await insertParent(pr.id, { ranAt: new Date('2026-10-14T12:00:00Z') });
      await insertParent(pr.id, { ranAt: new Date('2026-10-14T09:00:00Z') });
      // Newer rows that must never be returned: another repo, another workspace's repo,
      // and a foreign-workspace row that points at this very PR.
      await insertParent(otherPrSameWs.id, { ranAt: new Date('2026-10-14T13:00:00Z') });
      await insertParent(foreignPr.id, { workspaceId: otherWs, ranAt: new Date('2026-10-14T14:00:00Z') });
      await insertParent(pr.id, { workspaceId: otherWs, ranAt: new Date('2026-10-14T15:00:00Z') });

      expect(await latestRepo(repo.id)).toEqual({ id: newest.id });
      expect(await latestPr(pr.id)).toEqual({ id: newest.id });
      // The foreign workspace's own repo has runs, but not for the caller.
      expect(await latestRepo(foreignRepo.id)).toEqual({ id: null });
      expect(await latestPr(foreignPr.id)).toEqual({ id: null });
      await app.close();
    });
  });

  // ===========================================================================
  describe('workspace scoping of cancel and trace (AC-42)', () => {
    it('returns 404 for another workspace\'s run (run untouched, no trace body); the owner keeps working', async () => {
      const app = await appWith(new GateLLM({}));
      const otherWs = await createWorkspace(db);
      const { pr: foreignPr } = await setupRepoAndPr(db, otherWs);
      const { pr } = await setupRepoAndPr(db, workspaceId);
      const [foreignRun] = await db
        .insert(t.agentRuns)
        .values({ workspaceId: otherWs, prId: foreignPr.id, status: 'running' })
        .returning();
      await db.insert(t.runTraces).values({
        runId: foreignRun!.id,
        trace: { config: { agent: 'secret' } },
      });
      const [ownRun] = await db.insert(t.agentRuns).values({ workspaceId, prId: pr.id, status: 'running' }).returning();
      await db.insert(t.runTraces).values({
        runId: ownRun!.id,
        trace: {
          config: { agent: 'mine', version: '1', provider: 'openai', model: 'm', pr: 482, source: 'local' },
          stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, cost_usd: null, findings: 0, grounding: '0/0 passed' },
          prompt_assembly: { system: 's', skills: null, memory: null, specs: null, user: 'u' },
          tool_calls: [],
          raw_output: '',
          memory_pulled: [],
          specs_read: [],
          log: [],
        },
      });

      const cancel = await app.inject({ method: 'POST', url: `/runs/${foreignRun!.id}/cancel` });
      expect(cancel.statusCode).toBe(404);
      const trace = await app.inject({ method: 'GET', url: `/runs/${foreignRun!.id}/trace` });
      expect(trace.statusCode).toBe(404);
      expect(trace.body).not.toContain('secret');
      const missing = await app.inject({ method: 'POST', url: '/runs/00000000-0000-4000-8000-000000000000/cancel' });
      expect(missing.statusCode).toBe(404);
      const [after] = await db.select().from(t.agentRuns).where(eq(t.agentRuns.id, foreignRun!.id));
      expect(after!.status).toBe('running');

      // Owner: trace readable, cancel works.
      const own = await app.inject({ method: 'GET', url: `/runs/${ownRun!.id}/trace` });
      expect(own.statusCode).toBe(200);
      expect(own.json().config.agent).toBe('mine');
      const ownCancel = await app.inject({ method: 'POST', url: `/runs/${ownRun!.id}/cancel` });
      expect(ownCancel.statusCode).toBe(200);
      expect(ownCancel.json()).toEqual({ ok: true });
      const [cancelled] = await db.select().from(t.agentRuns).where(eq(t.agentRuns.id, ownRun!.id));
      expect(cancelled!.status).toBe('cancelled');
      await app.close();
    });
  });

  // ===========================================================================
  describe('GET /multi-agent/estimates (AC-6, AC-8)', () => {
    it('averages the last 5 local done runs per enabled agent; null without history; ignores failed/cancelled/ci', async () => {
      const app = await appWith(new GateLLM({}));
      const withHistory = await createAgent(db, workspaceId, { name: 'History' });
      const noHistory = await createAgent(db, workspaceId, { name: 'Fresh' });
      const disabled = await createAgent(db, workspaceId, { name: 'Off', enabled: false });
      const { pr } = await setupRepoAndPr(db, workspaceId);
      const day = (n: number) => new Date(Date.UTC(2026, 9, n, 12));
      const run = (n: number, over: Partial<typeof t.agentRuns.$inferInsert>) => ({
        workspaceId,
        prId: pr.id,
        agentId: withHistory.id,
        status: 'done',
        source: 'local' as const,
        ranAt: day(n),
        durationMs: n * 1000,
        costUsd: n / 100,
        ...over,
      });
      await db.insert(t.agentRuns).values([
        run(1, {}), // oldest of 7 local done: falls out of the window
        run(2, {}), // falls out
        run(3, {}),
        run(4, {}),
        run(5, {}),
        run(6, {}),
        run(7, { costUsd: null }), // newest local done: counts for duration only
        run(8, { status: 'failed', durationMs: 99_000, costUsd: 9 }),
        run(9, { status: 'cancelled', durationMs: 99_000, costUsd: 9 }),
        run(10, { source: 'ci', durationMs: 99_000, costUsd: 9 }),
        run(11, { agentId: disabled.id }),
      ]);

      const res = await app.inject({ method: 'GET', url: '/multi-agent/estimates' });
      expect(res.statusCode).toBe(200);
      const list: { agent_id: string; est_duration_ms: number | null; est_cost_usd: number | null }[] = res.json();

      // window = days 3..7: durations 3000+4000+5000+6000+7000 = 25000 / 5; costs 0.03..0.06 (day 7 unknown) = 0.18 / 4
      const mine = list.find((e) => e.agent_id === withHistory.id)!;
      expect(mine.est_duration_ms).toBe(5000);
      expect(mine.est_cost_usd).toBeCloseTo(0.045, 10);
      expect(list.find((e) => e.agent_id === noHistory.id)).toEqual({ agent_id: noHistory.id, est_duration_ms: null, est_cost_usd: null });
      expect(list.some((e) => e.agent_id === disabled.id)).toBe(false);
      await app.close();
    });
  });
});
