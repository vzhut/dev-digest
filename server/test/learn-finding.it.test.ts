import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * Learn (POST /findings/:id/learn) against real Postgres — spec
 * 2026-10-13-multi-agent-review.md AC-35..AC-38: one `learning` memory per finding,
 * no embedding / LLM call, provenance in `sources`, idempotent, atomic, workspace-scoped.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

type Db = PgFixture['handle']['db'];

class CountingEmbedder extends MockEmbedder {
  calls = 0;
  override async embed(texts: string[]) {
    this.calls += 1;
    return super.embed(texts);
  }
}

type LearnBody = {
  finding: { id: string; learned_at: string | null };
  memory: { id: string; kind: string; scope: string; content: string; created: boolean };
};

let seq = 0;

d('Learn finding (Testcontainers pg)', () => {
  let pg: PgFixture;
  let db: Db;
  let workspaceId: string;
  const embedder = new CountingEmbedder();
  const llm = new MockLLMProvider('openai');
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    pg = await startPg();
    db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces);
    workspaceId = ws!.id;
    app = await buildApp({
      config: config(),
      db,
      overrides: { embedder, git: new MockGitClient(), llm: { openai: llm } },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  /** A repo + PR + agent + (multi-agent child) run + review + one finding. */
  async function makeFinding(
    opts: {
      workspaceId?: string;
      multi?: boolean;
      confidence?: number;
      suggestion?: string | null;
      acceptedAt?: Date;
      dismissedAt?: Date;
      agentNameOnRun?: string | null;
    } = {},
  ) {
    const ws = opts.workspaceId ?? workspaceId;
    const n = seq++;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name: `learn-${n}`, fullName: `acme/learn-${n}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 482,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat',
        base: 'main',
        headSha: 'abc',
      })
      .returning();
    const [agent] = await db
      .insert(t.agents)
      .values({ workspaceId: ws, name: `Agent ${n}`, provider: 'openai', model: 'gpt-4.1', systemPrompt: 'p' })
      .returning();
    const [parent] = opts.multi
      ? await db.insert(t.multiAgentRuns).values({ workspaceId: ws, prId: pr!.id }).returning()
      : [undefined];
    const agentNameOnRun = opts.agentNameOnRun === undefined ? `Name at run ${n}` : opts.agentNameOnRun;
    const [run] = await db
      .insert(t.agentRuns)
      .values({
        workspaceId: ws,
        agentId: agent!.id,
        prId: pr!.id,
        status: 'done',
        agentName: agentNameOnRun,
        multiAgentRunId: parent?.id ?? null,
      })
      .returning();
    const [review] = await db
      .insert(t.reviews)
      .values({ workspaceId: ws, prId: pr!.id, agentId: agent!.id, runId: run!.id, kind: 'review', verdict: 'comment', score: 80 })
      .returning();
    const [finding] = await db
      .insert(t.findings)
      .values({
        reviewId: review!.id,
        file: 'src/ratelimit.ts',
        startLine: 52,
        endLine: 53,
        severity: 'WARNING',
        category: 'api',
        title: 'Retry-After header omitted on 429',
        rationale: 'Clients cannot back off without it.',
        suggestion: opts.suggestion === undefined ? 'Set the Retry-After header.' : opts.suggestion,
        confidence: opts.confidence ?? 0.8,
        acceptedAt: opts.acceptedAt ?? null,
        dismissedAt: opts.dismissedAt ?? null,
      })
      .returning();
    return { repo: repo!, pr: pr!, agent: agent!, parent, run: run!, review: review!, finding: finding!, agentNameOnRun };
  }

  const learn = async (findingId: string) => app.inject({ method: 'POST', url: `/findings/${findingId}/learn` });
  const memoryOf = (repoId: string) => db.select().from(t.memory).where(eq(t.memory.repoId, repoId));
  const findingRow = async (id: string) => (await db.select().from(t.findings).where(eq(t.findings.id, id)))[0]!;

  it('saves one repo learning from a multi-agent finding: content, confidence, provenance, no embedding, no LLM call', async () => {
    const fx = await makeFinding({ multi: true, confidence: 0.8 });
    // A rename after the run must not rewrite attribution: the name stored on the run wins.
    await db.update(t.agents).set({ name: 'Renamed later' }).where(eq(t.agents.id, fx.agent.id));
    llm.calls.length = 0;
    embedder.calls = 0;

    const res = await learn(fx.finding.id);
    expect(res.statusCode).toBe(200);
    const body: LearnBody = res.json();

    expect(body.memory).toMatchObject({ kind: 'learning', scope: 'repo', created: true });
    expect(body.memory.content).toBe(
      'Retry-After header omitted on 429\n\nsrc/ratelimit.ts:52\n\nClients cannot back off without it.\n\nSuggestion: Set the Retry-After header.',
    );

    const rows = await memoryOf(fx.repo.id);
    expect(rows).toHaveLength(1);
    const mem = rows[0]!;
    expect(mem).toMatchObject({
      id: body.memory.id,
      workspaceId,
      repoId: fx.repo.id,
      scope: 'repo',
      kind: 'learning',
      content: body.memory.content,
      confidence: 0.8,
      embedding: null,
    });

    const stored = await findingRow(fx.finding.id);
    expect(stored.learnedMemoryId).toBe(mem.id);
    expect(stored.learnedAt).not.toBeNull();
    expect(body.finding.learned_at).toBe(stored.learnedAt!.toISOString());

    const sources = mem.sources as Record<string, unknown>[];
    expect(sources).toHaveLength(1);
    expect(sources[0]).toEqual({
      pr: 482,
      context: `Learned from a finding by ${fx.agentNameOnRun} on PR #482`,
      finding_id: fx.finding.id,
      pr_id: fx.pr.id,
      run_id: fx.run.id,
      multi_agent_run_id: fx.parent!.id,
      agent_id: fx.agent.id,
      agent_name: fx.agentNameOnRun,
      decision: 'undecided',
      learned_at: stored.learnedAt!.toISOString(),
      origin: 'agent_output',
    });

    expect(llm.calls).toEqual([]);
    expect(embedder.calls).toBe(0);
  });

  it('a second and a concurrent Learn return the existing entry (created:false) and create no duplicate', async () => {
    const fx = await makeFinding({ multi: true });
    const first: LearnBody = (await learn(fx.finding.id)).json();
    const learnedAt = (await findingRow(fx.finding.id)).learnedAt;

    const second = await learn(fx.finding.id);
    expect(second.statusCode).toBe(200);
    const secondBody: LearnBody = second.json();
    expect(first.memory.created).toBe(true);
    expect(secondBody.memory).toMatchObject({ id: first.memory.id, content: first.memory.content, created: false });
    expect(secondBody.finding.learned_at).toBe(first.finding.learned_at);
    expect(await memoryOf(fx.repo.id)).toHaveLength(1);
    expect((await findingRow(fx.finding.id)).learnedAt).toEqual(learnedAt);

    // Two simultaneous clicks on a fresh finding: exactly one creates.
    const fresh = await makeFinding({ multi: true });
    const [r1, r2] = (await Promise.all([learn(fresh.finding.id), learn(fresh.finding.id)])).map((r) => r.json() as LearnBody);
    expect(r1!.memory.id).toBe(r2!.memory.id);
    expect([r1!.memory.created, r2!.memory.created].sort()).toEqual([false, true]);
    expect(await memoryOf(fresh.repo.id)).toHaveLength(1);
  });

  it('records the decision at learn time and omits the parent key for a plain single-agent run', async () => {
    const accepted = await makeFinding({ acceptedAt: new Date('2026-10-14T09:00:00Z') });
    const dismissed = await makeFinding({ dismissedAt: new Date('2026-10-14T09:00:00Z') });
    const undecided = await makeFinding();

    const decisions: string[] = [];
    for (const fx of [accepted, dismissed, undecided]) {
      expect((await learn(fx.finding.id)).statusCode).toBe(200);
      const source = (await memoryOf(fx.repo.id))[0]!.sources as Record<string, unknown>[];
      decisions.push(source[0]!.decision as string);
      expect(source[0]).not.toHaveProperty('multi_agent_run_id');
      expect(source[0]).toMatchObject({ run_id: fx.run.id, origin: 'agent_output' });
    }
    expect(decisions).toEqual(['accepted', 'dismissed', 'undecided']);
  });

  it('drops the suggestion line when there is none and clamps confidence into [0, 1]', async () => {
    const noSuggestion = await makeFinding({ suggestion: null, confidence: 1.7 });
    const body: LearnBody = (await learn(noSuggestion.finding.id)).json();
    expect(body.memory.content).not.toContain('Suggestion');
    expect((await memoryOf(noSuggestion.repo.id))[0]!.confidence).toBe(1);

    const negative = await makeFinding({ confidence: -0.4 });
    await learn(negative.finding.id);
    expect((await memoryOf(negative.repo.id))[0]!.confidence).toBe(0);
  });

  it('keeps the run\'s agent name for a finding whose agent was deleted, with no agent id', async () => {
    const fx = await makeFinding({ multi: true });
    await db.delete(t.agents).where(eq(t.agents.id, fx.agent.id));

    expect((await learn(fx.finding.id)).statusCode).toBe(200);
    const source = ((await memoryOf(fx.repo.id))[0]!.sources as Record<string, unknown>[])[0]!;
    expect(source.agent_name).toBe(fx.agentNameOnRun);
    // Spec edge case: "agent id empty". reviews.agent_id has no FK, so the stale id survives the delete.
    expect(source).not.toHaveProperty('agent_id');
  });

  it('answers 404 and writes nothing for a finding in another workspace or an unknown id', async () => {
    const [other] = await db.insert(t.workspaces).values({ name: 'Other workspace' }).returning();
    const foreign = await makeFinding({ workspaceId: other!.id });

    const res = await learn(foreign.finding.id);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
    expect(await memoryOf(foreign.repo.id)).toEqual([]);
    const row = await findingRow(foreign.finding.id);
    expect(row.learnedAt).toBeNull();
    expect(row.learnedMemoryId).toBeNull();

    expect((await learn('00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
  });

  it('leaves no memory row and no learned marker when the write fails mid-transaction, and a retry succeeds', async () => {
    const fx = await makeFinding({ multi: true });
    // Fail the LAST step of the transaction (linking the memory to the finding) for this finding only.
    await db.execute(sql.raw(`
      CREATE OR REPLACE FUNCTION learn_test_block_link() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'learn_test: link blocked';
      END $$ LANGUAGE plpgsql`));
    await db.execute(
      sql.raw(`
      CREATE TRIGGER learn_test_block_link_trg BEFORE UPDATE OF learned_memory_id ON findings
      FOR EACH ROW WHEN (NEW.id = '${fx.finding.id}' AND NEW.learned_memory_id IS NOT NULL)
      EXECUTE FUNCTION learn_test_block_link()`),
    );
    try {
      const failed = await learn(fx.finding.id);
      expect(failed.statusCode).toBe(500);
      expect(failed.json().error).toBeDefined();
      expect(await memoryOf(fx.repo.id)).toEqual([]);
      const row = await findingRow(fx.finding.id);
      expect(row.learnedAt).toBeNull();
      expect(row.learnedMemoryId).toBeNull();
    } finally {
      await db.execute(sql.raw('DROP TRIGGER learn_test_block_link_trg ON findings'));
      await db.execute(sql.raw('DROP FUNCTION learn_test_block_link()'));
    }

    const retry: LearnBody = (await learn(fx.finding.id)).json();
    expect(retry.memory.created).toBe(true);
    expect(await memoryOf(fx.repo.id)).toHaveLength(1);
  });

  it('recreates the learning when its memory row was deleted (FK nulls the link), keeping the original learned_at', async () => {
    const fx = await makeFinding({ multi: true });
    const first: LearnBody = (await learn(fx.finding.id)).json();
    const learnedAt = (await findingRow(fx.finding.id)).learnedAt;

    await db.delete(t.memory).where(eq(t.memory.id, first.memory.id));
    const orphan = await findingRow(fx.finding.id);
    expect(orphan.learnedMemoryId).toBeNull();
    expect(orphan.learnedAt).not.toBeNull();

    const again: LearnBody = (await learn(fx.finding.id)).json();
    expect(again.memory.created).toBe(true);
    expect(again.memory.id).not.toBe(first.memory.id);
    const rows = await memoryOf(fx.repo.id);
    expect(rows.map((r) => r.id)).toEqual([again.memory.id]);
    const relinked = await findingRow(fx.finding.id);
    expect(relinked.learnedMemoryId).toBe(again.memory.id);
    expect(relinked.learnedAt).toEqual(learnedAt);
  });
});
