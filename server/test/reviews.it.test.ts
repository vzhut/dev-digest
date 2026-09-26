import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { FakeIntentLLM } from './helpers/intent.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/**
 * A unified diff touching src/config.ts (line 11 added) so grounding can keep a
 * finding on line 11 and drop one on line 999 / a non-existent file.
 */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** A Review fixture: one valid finding (line 11), one hallucinated (line 999). */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
    {
      id: 'f-halluc',
      severity: 'WARNING',
      category: 'bug',
      title: 'Phantom finding on a line not in the diff',
      file: 'src/config.ts',
      start_line: 999,
      end_line: 999,
      rationale: 'This line does not exist in the diff.',
      confidence: 0.5,
      kind: 'finding',
    },
  ],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `payments-api-${repoSeq++}`;
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
      body: 'Add rate limiting. Closes #471.',
    })
    .returning();
  // persist the patch so the reviewer can reconstruct a diff (MockGit also returns one)
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('A2 reviews + agents (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(structured: unknown, provider: 'openai' | 'anthropic' = 'openai') {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          [provider]: new MockLLMProvider(provider, { structured }),
          // Every review now runs the intent classifier first (default model is
          // OpenRouter). Stub it to fail fast so these tests stay offline even on a
          // machine whose ~/.devdigest/secrets.json holds a real OPENROUTER_API_KEY;
          // the intent step is fail-soft, so reviews proceed without intent.
          openrouter: new FakeIntentLLM(undefined, new Error('intent classifier disabled in this test')),
        },
      },
    });
  }

  it('agents CRUD', async () => {
    const app = await appWith(REVIEW_FIXTURE);

    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'Test Reviewer',
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a reviewer.',
      },
    });
    expect(created.statusCode).toBe(201);
    const agent = created.json();
    expect(agent.version).toBe(1);

    const list = (await app.inject({ method: 'GET', url: '/agents' })).json();
    expect(list.some((a: { id: string }) => a.id === agent.id)).toBe(true);

    // a config change bumps version
    const updated = (
      await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}`,
        payload: { system_prompt: 'Updated prompt.' },
      })
    ).json();
    expect(updated.version).toBe(2);

    await app.close();
  });

  it('runs a review: map-reduce + grounding drops the hallucinated finding, keeps the valid one', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.runs).toHaveLength(1);

    // runReview is fire-and-forget: wait for the background run, then read the
    // persisted reviews (the POST returns runIds, not the reviews themselves).
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews).toHaveLength(1);

    const review = reviews[0];
    expect(review.verdict).toBe('request_changes');
    // Score is derived from the GROUNDED findings, not the model's self-reported
    // 42: grounding keeps one CRITICAL (line 11) ⇒ 100 − 35 = 65.
    expect(review.score).toBe(65);
    // grounding kept only the valid finding (line 11), dropped the line-999 one
    expect(review.findings).toHaveLength(1);
    expect(review.findings[0].file).toBe('src/config.ts');
    expect(review.findings[0].start_line).toBe(11);

    // a run_traces document was written (single doc)
    const runId = body.runs[0].run_id;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.config.model).toBe('gpt-4.1');
    expect(trace.stats.grounding).toBe('1/2 passed');
    expect(trace.log.length).toBeGreaterThan(0);
    // Cost reaches the trace stats (the drawer's COST tile reads this).
    expect(trace.stats.cost_usd).toBeGreaterThan(0);

    // agent_runs row populated for A5 to aggregate
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    expect(run!.findingsCount).toBe(1);
    expect(run!.grounding).toBe('1/2 passed');
    // The provider's reported cost is persisted, not dropped on the floor.
    expect(run!.costUsd).toBeCloseTo(0.001, 6);

    // …and surfaces on the run history the timeline renders.
    const runs = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json();
    expect(runs[0].cost_usd).toBeCloseTo(0.001, 6);
    // …and the timeline popover gets the run's grounded findings as previews.
    expect(runs[0].findings).toHaveLength(1);
    expect(runs[0].findings[0]).toMatchObject({ severity: 'CRITICAL', file: 'src/config.ts', start_line: 11 });

    // …and on the review, joined via run_id for the verdict banner.
    expect(review.cost_usd).toBeCloseTo(0.001, 6);
    expect(review.tokens_in).toBe(100);

    await app.close();
  });

  it('PR list COST is the sum across successful runs on the PR', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sum', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();

    // Two passes over the same PR ⇒ the list shows what the PR cost IN TOTAL,
    // not just the latest run.
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const listed = pulls.find((p: { id: string }) => p.id === pr.id);
    expect(listed.cost_usd).toBeCloseTo(0.002, 6);

    await app.close();
  });

  it('PR list COST counts only successful runs; a PR whose runs all failed reads null', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr: mixed } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const { pr: onlyFailed } = await setupRepoAndPr(pg.handle.db, workspaceId);
    // Move the second PR into the same repo so both show up in one list call.
    await pg.handle.db
      .update(t.pullRequests)
      .set({ repoId: repo.id, number: 483 })
      .where(eq(t.pullRequests.id, onlyFailed.id));

    // Failed runs carry a cost on purpose (as a pre-fix backfill could have
    // left them) to prove the STATUS filter, not the null, excludes them.
    await pg.handle.db.insert(t.agentRuns).values([
      { workspaceId, prId: mixed.id, status: 'done', model: 'gpt-4.1', costUsd: 0.01 },
      { workspaceId, prId: mixed.id, status: 'failed', model: 'gpt-4.1', costUsd: 0.5 },
      { workspaceId, prId: onlyFailed.id, status: 'failed', model: 'gpt-4.1', tokensIn: 0, tokensOut: 0, costUsd: 0 },
      { workspaceId, prId: onlyFailed.id, status: 'cancelled', model: 'gpt-4.1', costUsd: null },
    ]);

    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const byId = (id: string) => pulls.find((p: { id: string }) => p.id === id);
    expect(byId(mixed.id).cost_usd).toBeCloseTo(0.01, 6);
    // All runs failed ⇒ empty ("—"), never "$0.0000".
    expect(byId(onlyFailed.id).cost_usd).toBeNull();

    await app.close();
  });

  it('a PR with no runs reports an UNKNOWN cost, not zero', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const listed = pulls.find((p: { id: string }) => p.id === pr.id);
    // null ⇒ the UI renders "—". A 0 here would claim the PR was reviewed free.
    expect(listed.cost_usd).toBeNull();

    await app.close();
  });

  /** Insert a review (+ findings) directly — deterministic data for the preview tests. */
  async function insertReview(
    prId: string,
    opts: {
      createdAt: Date;
      runId?: string;
      findings?: { severity: string; file: string; startLine: number; title: string; rationale?: string }[];
    },
  ) {
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId, runId: opts.runId, kind: 'review', verdict: 'comment', score: 80, createdAt: opts.createdAt })
      .returning();
    if (opts.findings?.length) {
      await pg.handle.db.insert(t.findings).values(
        opts.findings.map((f) => ({
          reviewId: review!.id,
          file: f.file,
          startLine: f.startLine,
          endLine: f.startLine,
          severity: f.severity,
          category: 'bug',
          title: f.title,
          rationale: f.rationale ?? 'why',
          confidence: 0.9,
        })),
      );
    }
    return review!;
  }

  it('PR list FINDINGS: null when never reviewed, [] when the latest review is clean, else only the latest review', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr: unreviewed } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const { pr: clean } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const { pr: mixed } = await setupRepoAndPr(pg.handle.db, workspaceId);
    for (const [pr, number] of [[clean, 483], [mixed, 484]] as const) {
      await pg.handle.db.update(t.pullRequests).set({ repoId: repo.id, number }).where(eq(t.pullRequests.id, pr.id));
    }

    // clean: an OLDER review had a finding, the latest found nothing ⇒ [].
    await insertReview(clean.id, {
      createdAt: new Date('2026-01-01'),
      findings: [{ severity: 'CRITICAL', file: 'old.ts', startLine: 1, title: 'stale' }],
    });
    await insertReview(clean.id, { createdAt: new Date('2026-01-02') });

    // mixed: the latest review's findings, inserted out of order, one long rationale.
    await insertReview(mixed.id, {
      createdAt: new Date('2026-01-01'),
      findings: [{ severity: 'WARNING', file: 'old.ts', startLine: 1, title: 'from an older run' }],
    });
    await insertReview(mixed.id, {
      createdAt: new Date('2026-01-02'),
      findings: [
        { severity: 'SUGGESTION', file: 'a.ts', startLine: 5, title: 'sugg' },
        { severity: 'WARNING', file: 'b.ts', startLine: 9, title: 'warn b' },
        { severity: 'CRITICAL', file: 'z.ts', startLine: 3, title: 'crit', rationale: 'r'.repeat(500) },
        { severity: 'WARNING', file: 'a.ts', startLine: 7, title: 'warn a' },
      ],
    });

    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const byId = (id: string) => pulls.find((p: { id: string }) => p.id === id);

    expect(byId(unreviewed.id).latest_findings).toBeNull();
    expect(byId(clean.id).latest_findings).toEqual([]);

    const previews = byId(mixed.id).latest_findings;
    // Severity first, then file, then line; the older review's finding is absent.
    expect(previews.map((f: { title: string }) => f.title)).toEqual(['crit', 'warn a', 'warn b', 'sugg']);
    expect(previews[0].summary).toHaveLength(201); // 200 chars + "…"
    expect(previews[0]).not.toHaveProperty('rationale');

    await app.close();
  });

  it('PR run history: a run carries its own review findings; a run without a review carries null', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const [done, clean, failed] = await pg.handle.db
      .insert(t.agentRuns)
      .values([
        { workspaceId, prId: pr.id, status: 'done', model: 'gpt-4.1', ranAt: new Date('2026-01-03') },
        { workspaceId, prId: pr.id, status: 'done', model: 'gpt-4.1', ranAt: new Date('2026-01-02') },
        { workspaceId, prId: pr.id, status: 'failed', model: 'gpt-4.1', ranAt: new Date('2026-01-01') },
      ])
      .returning();
    await insertReview(pr.id, {
      createdAt: new Date('2026-01-03'),
      runId: done!.id,
      findings: [
        { severity: 'WARNING', file: 'a.ts', startLine: 2, title: 'warn' },
        { severity: 'CRITICAL', file: 'a.ts', startLine: 1, title: 'crit' },
      ],
    });
    await insertReview(pr.id, { createdAt: new Date('2026-01-02'), runId: clean!.id });

    const runs = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json();
    const byId = (id: string) => runs.find((r: { run_id: string }) => r.run_id === id);

    expect(byId(done!.id).findings.map((f: { title: string }) => f.title)).toEqual(['crit', 'warn']);
    expect(byId(clean!.id).findings).toEqual([]);
    expect(byId(failed!.id).findings).toBeNull();

    await app.close();
  });

  it('dual-provider structured output: anthropic provider returns the same Review shape', async () => {
    const app = await appWith(REVIEW_FIXTURE, 'anthropic');
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Claude Rev', provider: 'anthropic', model: 'claude-x', system_prompt: 'rev' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews[0].findings).toHaveLength(1);
    expect(reviews[0].model).toBe('claude-x');
    await app.close();
  });

  it('finding actions: accept, dismiss', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'ActAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    const findingId = reviews[0].findings[0].id;

    const accepted = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/accept` })
    ).json();
    expect(accepted.finding.accepted_at).not.toBeNull();

    const dismissed = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/dismiss` })
    ).json();
    expect(dismissed.finding.dismissed_at).not.toBeNull();
    expect(dismissed.finding.accepted_at).toBeNull();

    await app.close();
  });

  it('SSE: /runs/:id/events streams events and completes', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'SseAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    // The run is synchronous; events are buffered on the bus. Subscribing after
    // the run still replays the buffer (replay-first semantics), then completes.
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    const runId = body.runs[0].run_id;

    const sse = await app.inject({ method: 'GET', url: `/runs/${runId}/events` });
    expect(sse.statusCode).toBe(200);
    expect(sse.headers['content-type']).toContain('text/event-stream');
    // The replay buffer should contain our log lines as SSE `data:` frames.
    expect(sse.payload).toContain('Starting review');
    expect(sse.payload).toContain('Citation grounding');
    await app.close();
  });

  it('run all enabled agents reviews with each enabled agent', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { all: true } })
    ).json();
    // seed has 2 enabled agents; we may have created more above in this PR's ws.
    expect(body.runs.length).toBeGreaterThanOrEqual(2);
    await app.close();
  });
});
