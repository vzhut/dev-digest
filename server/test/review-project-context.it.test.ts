import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { FakeIntentLLM, setupPr } from './helpers/intent.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockLLMProvider,
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockProjectDocs,
} from '../src/adapters/mocks.js';
import { TiktokenTokenizer } from '../src/adapters/tokenizer/index.js';
import * as t from '../src/db/schema.js';
import type { LLMProvider, Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  legacyFlag: true,
   redisUrl: x,`;

const REVIEW: Review = { verdict: 'comment', summary: 'ok', score: 50, findings: [] };

const DOC_A = '# Architecture\n\nModule `api/` must not import `db/` directly.\n';
const DOC_B = '# Security rules\n\nNever log secrets.\n';
const DOC_C = '# ADR 1\n\nUse Postgres.\n';

/** An agent LLM that always fails, to prove the trace keeps `specs_read`. */
class FailingLLM implements LLMProvider {
  readonly id = 'openai' as const;
  async listModels() {
    return [];
  }
  async complete(): Promise<never> {
    throw new Error('boom');
  }
  async embed(): Promise<number[][]> {
    return [];
  }
  async completeStructured(): Promise<never> {
    throw new Error('boom');
  }
}

d('review run × project context (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const tokenizer = new TiktokenTokenizer();

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    workspaceId = (await pg.handle.db.select().from(t.workspaces))[0]!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  // Every provider the flow can reach is injected: a missing one would resolve
  // through the real secrets provider and could make a paid network call.
  function appWith(agentLlm: LLMProvider, docs: MockProjectDocs) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        llm: { openai: agentLlm, openrouter: new FakeIntentLLM(undefined, new Error('stub')) },
        projectDocs: docs,
      },
    });
  }

  async function runReview(
    app: Awaited<ReturnType<typeof appWith>>,
    opts: { clonePath: string | null; agentPaths?: string[]; skillPaths?: string[] },
  ) {
    const { repo, pr } = await setupPr(pg.handle.db, workspaceId);
    await pg.handle.db.update(t.repos).set({ clonePath: opts.clonePath }).where(eq(t.repos.id, repo.id));
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `A-${Math.random()}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();
    await pg.handle.db
      .update(t.agents)
      .set({ contextPaths: opts.agentPaths ?? [] })
      .where(eq(t.agents.id, agent.id));
    if (opts.skillPaths) {
      const [skill] = await pg.handle.db
        .insert(t.skills)
        .values({
          workspaceId,
          name: `S-${Math.random()}`,
          description: 'd',
          type: 'custom',
          source: 'manual',
          body: 'skill body',
          contextPaths: opts.skillPaths,
        })
        .returning();
      await pg.handle.db.insert(t.agentSkills).values({ agentId: agent.id, skillId: skill!.id, order: 0 });
    }
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    expect(res.statusCode).toBe(200);
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const runId = res.json().runs[0].run_id as string;
    // agent_runs turns terminal just BEFORE saveRunTrace; poll until the trace exists.
    let trace: any = { log: [] };
    for (let i = 0; i < 100; i++) {
      const r = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
      if (r.statusCode === 200) {
        trace = r.json();
        break;
      }
      await new Promise((r2) => setTimeout(r2, 50));
    }
    return { run: runs[0]!, trace, logs: trace.log.map((l: { msg: string }) => l.msg) as string[] };
  }

  it('injects attached docs in set order (agent, then skill, deduped) and records tokens', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW });
    const app = await appWith(llm, new MockProjectDocs({ 'docs/b.md': DOC_B, 'specs/a.md': DOC_A, 'docs/c.md': DOC_C }));
    const { run, trace, logs } = await runReview(app, {
      clonePath: '/clone',
      agentPaths: ['docs/b.md', 'specs/a.md'],
      skillPaths: ['specs/a.md', 'docs/c.md'],
    });

    expect(run.status).toBe('done');
    const specs = trace.prompt_assembly.specs as string;
    expect(specs).toContain('Module `api/` must not import `db/` directly.');
    expect(specs.indexOf('docs/b.md')).toBeGreaterThanOrEqual(0);
    expect(specs.indexOf('docs/b.md')).toBeLessThan(specs.indexOf('specs/a.md'));
    expect(specs.indexOf('specs/a.md')).toBeLessThan(specs.indexOf('docs/c.md'));
    expect(trace.specs_read).toEqual([
      { path: 'docs/b.md', tokens: tokenizer.count(DOC_B), status: 'included' },
      { path: 'specs/a.md', tokens: tokenizer.count(DOC_A), status: 'included' },
      { path: 'docs/c.md', tokens: tokenizer.count(DOC_C), status: 'included' },
    ]);
    const total = tokenizer.count(DOC_A) + tokenizer.count(DOC_B) + tokenizer.count(DOC_C);
    expect(logs).toContain(`project context: 3 attached, 3 included, 0 missing, ${total} tokens`);
    // The docs reached the model (one review call).
    const call = llm.calls.find((c) => c.method === 'completeStructured')!;
    expect(JSON.stringify(call.req)).toContain('Never log secrets.');
  });

  it('a deleted doc is traced as missing with a reason and the run still completes', async () => {
    const app = await appWith(
      new MockLLMProvider('openai', { structured: REVIEW }),
      new MockProjectDocs({ 'specs/a.md': DOC_A }, ['docs/leak.md']),
    );
    const { run, trace, logs } = await runReview(app, {
      clonePath: '/clone',
      agentPaths: ['specs/a.md', 'specs/gone.md', 'docs/leak.md'],
    });

    expect(run.status).toBe('done');
    expect(trace.specs_read).toEqual([
      { path: 'specs/a.md', tokens: tokenizer.count(DOC_A), status: 'included' },
      { path: 'specs/gone.md', tokens: 0, status: 'missing', reason: 'not found' },
      { path: 'docs/leak.md', tokens: 0, status: 'missing', reason: 'outside clone' },
    ]);
    expect(logs).toContain('project context: skipped specs/gone.md (not found)');
    expect(logs).toContain('project context: skipped docs/leak.md (outside clone)');
    expect(logs.some((m) => m.startsWith('project context: 3 attached, 1 included, 2 missing'))).toBe(true);
    expect(trace.prompt_assembly.specs).not.toContain('specs/gone.md');
  });

  it('a failing LLM still persists specs_read in the failure trace', async () => {
    const app = await appWith(new FailingLLM(), new MockProjectDocs({ 'specs/a.md': DOC_A }));
    const { run, trace } = await runReview(app, { clonePath: '/clone', agentPaths: ['specs/a.md'] });

    expect(run.status).toBe('failed');
    expect(trace.specs_read).toEqual([{ path: 'specs/a.md', tokens: tokenizer.count(DOC_A), status: 'included' }]);
  });

  it('no attachments: specs null, specs_read [], no project-context log, no reads', async () => {
    const docs = new MockProjectDocs({ 'specs/a.md': DOC_A });
    const app = await appWith(new MockLLMProvider('openai', { structured: REVIEW }), docs);
    const { run, trace, logs } = await runReview(app, { clonePath: '/clone' });

    expect(run.status).toBe('done');
    expect(trace.prompt_assembly.specs).toBeNull();
    expect(trace.specs_read).toEqual([]);
    expect(logs.some((m) => m.startsWith('project context:'))).toBe(false);
    expect(docs.reads).toEqual([]);
  });

  it('a repo without a clone marks every attached doc missing', async () => {
    const docs = new MockProjectDocs({ 'specs/a.md': DOC_A });
    const app = await appWith(new MockLLMProvider('openai', { structured: REVIEW }), docs);
    const { run, trace } = await runReview(app, { clonePath: null, agentPaths: ['specs/a.md'] });

    expect(run.status).toBe('done');
    expect(trace.specs_read).toEqual([{ path: 'specs/a.md', tokens: 0, status: 'missing', reason: 'not found' }]);
    expect(trace.prompt_assembly.specs).toBeNull();
    expect(docs.reads).toEqual([]);
  });
});
