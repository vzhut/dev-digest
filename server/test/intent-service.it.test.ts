import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { FakeIntentLLM, setupPr } from './helpers/intent.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient, MockRepoFileReader } from '../src/adapters/mocks.js';
import type { RepoFileReader } from '../src/adapters/git/repo-file-reader.js';
import * as t from '../src/db/schema.js';
import type { GitHubClient } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test', INTENT_TICKET_HOSTS: '' } as NodeJS.ProcessEnv);

class IssueGitHub extends MockGitHubClient {
  async getIssue(_repo: { owner: string; name: string }, n: number) {
    if (n === 12) throw Object.assign(new Error('Not Found'), { status: 404 });
    return { number: n, title: `Issue ${n}`, body: 'Users need throttling on /v1.', state: 'open' };
  }
}

d('IntentService (Testcontainers pg)', () => {
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

  const appWith = (llm: FakeIntentLLM | null, extra: { github?: GitHubClient; repoFiles?: RepoFileReader } = {}) =>
    buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: extra.github ?? new IssueGitHub(),
        ...(extra.repoFiles ? { repoFiles: extra.repoFiles } : {}),
        ...(llm ? { llm: { openrouter: llm } } : { secrets: { get: async () => undefined } }),
      },
    });

  it('derives from metadata only, persists usage/sources/confidence, and never sends diff bodies', async () => {
    const llm = new FakeIntentLLM();
    const app = await appWith(llm);
    const { pr } = await setupPr(pg.handle.db, workspaceId);

    expect((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json()).toEqual({ intent: null });

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    const rec = res.json();
    expect(rec).toMatchObject({
      pr_id: pr.id,
      intent: 'Add rate limiting to public endpoints.',
      in_scope: ['rate limiter'],
      out_of_scope: ['users endpoint refactor'],
      risk_areas: ['webhooks'],
      head_sha: 'a1b2c3d4e5f6',
      stale: false,
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      tokens_in: 1402,
      tokens_out: 188,
      cost_usd: 0.00031,
    });
    // description is long enough, no linked source, nothing missing → medium (not model-reported)
    expect(rec.confidence).toBe('medium');
    expect(rec.sources.map((s: { kind: string }) => s.kind)).toEqual(['pr_title', 'pr_description', 'file_list', 'hunk_headers']);

    const req = llm.calls[0]!;
    expect(req.schemaName).toBe('Intent');
    expect(req.requireParameters).toBe(true);
    const text = req.messages.map((m) => m.content).join('\n');
    expect(text).toContain('@@ -10,3 +10,4 @@');
    expect(text).not.toContain('sk_live_xxx');
    expect(text).not.toContain('redisUrl');

    const got = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json();
    expect(got.intent).toMatchObject({ intent: rec.intent, stale: false });
    await app.close();
  });

  it('review pre-work reuses an existing intent (no LLM call), flags a stale one, POST re-derives', async () => {
    const llm = new FakeIntentLLM();
    const app = await appWith(llm);
    const { pr, repo } = await setupPr(pg.handle.db, workspaceId);
    const svc = app.container.prIntent;

    const first = await svc.ensureForReview(workspaceId, pr, repo);
    expect(first.origin).toBe('derived');
    const second = await svc.ensureForReview(workspaceId, pr, repo);
    expect(second.origin).toBe('cached');
    expect(second.record?.stale).toBe(false);
    expect(llm.calls).toHaveLength(1);

    // The PR moves: GET reports stale; a review still reuses it (flagged), no new call.
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'ffffffffffff' }).where(eq(t.pullRequests.id, pr.id));
    expect((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json().intent.stale).toBe(true);
    const moved = { ...pr, headSha: 'ffffffffffff' };
    const reused = await svc.ensureForReview(workspaceId, moved, repo);
    expect(reused.origin).toBe('cached');
    expect(reused.record?.stale).toBe(true);
    expect(llm.calls).toHaveLength(1);

    const rerun = (await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` })).json();
    expect(rerun).toMatchObject({ stale: false, head_sha: 'ffffffffffff' });
    expect(llm.calls).toHaveLength(2);
    await app.close();
  });

  it('records unreachable / blocked links as missing_context and lowers confidence', async () => {
    const llm = new FakeIntentLLM();
    const reader = new MockRepoFileReader({ 'specs/plan.md': '# Plan\nthrottle /v1' });
    const app = await appWith(llm, { repoFiles: reader });
    const body =
      'Adds a token-bucket rate limiter. Closes #12. Plan: specs/plan.md and specs/none.md. ' +
      'See https://evil.example/doc?token=abc and https://jira.acme.com/browse/ABC-1 and ../../etc/passwd.md';
    const { pr } = await setupPr(pg.handle.db, workspaceId, { body });

    const rec = (await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` })).json();
    const bySrc = Object.fromEntries(rec.sources.map((s: { ref: string }) => [s.ref, s]));
    expect(bySrc['#12']).toMatchObject({ status: 'missing', reason: 'not found' });
    expect(bySrc['specs/plan.md']).toMatchObject({ status: 'used' });
    expect(bySrc['specs/none.md']).toMatchObject({ status: 'missing' });
    expect(bySrc['evil.example']).toMatchObject({ status: 'blocked', reason: 'arbitrary URL not fetched' });
    expect(bySrc['jira.acme.com/ABC-1']).toMatchObject({ status: 'blocked', reason: 'host not allowlisted' });
    expect(rec.missing_context).toEqual(expect.arrayContaining(['#12 (not found)', 'specs/none.md (not found)']));
    expect(JSON.stringify(rec)).not.toContain('token=abc');
    // A linked source loaded, but others missing/blocked → medium; the unsafe path never reached the reader.
    expect(rec.confidence).toBe('medium');
    expect(reader.reads.sort()).toEqual(['specs/none.md', 'specs/plan.md']);

    const prompt = llm.calls[0]!.messages.map((m) => m.content).join('\n');
    expect(prompt).toContain('## Unavailable context');
    expect(prompt).toContain('#12 (missing)');
    await app.close();
  });

  it('a one-sentence description with no linked source yields low confidence (no scope filtering)', async () => {
    const llm = new FakeIntentLLM();
    const app = await appWith(llm);
    const { pr } = await setupPr(pg.handle.db, workspaceId, {
      body: 'Adds a token-bucket rate limiter to the public API endpoints.',
    });
    const rec = (await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` })).json();
    expect(rec.confidence).toBe('low');
    await app.close();
  });

  it('an empty description yields low confidence; an unprimed PR records the missing file list', async () => {
    const llm = new FakeIntentLLM();
    const app = await appWith(llm);
    const { pr } = await setupPr(pg.handle.db, workspaceId, { body: '', files: false });
    const rec = (await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` })).json();
    expect(rec.confidence).toBe('low');
    expect(rec.missing_context.join(' ')).toContain('file list not loaded — open the PR once');
    await app.close();
  });

  it('a missing provider key: POST → 400, review pre-work is fail-soft (null, never throws)', async () => {
    const app = await appWith(null);
    const { pr, repo } = await setupPr(pg.handle.db, workspaceId);
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('config_error');

    const r = await app.container.prIntent.ensureForReview(workspaceId, pr, repo);
    expect(r).toMatchObject({ record: null, origin: 'failed' });
    expect(await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id))).toHaveLength(0);
    await app.close();
  });

  it('an LLM failure surfaces as 502 with the secret redacted', async () => {
    const app = await appWith(new FakeIntentLLM(undefined, new Error('upstream said Bearer sk-or-v1-abcdef1234567890 rejected')));
    const { pr } = await setupPr(pg.handle.db, workspaceId);
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain('sk-or-v1-abcdef');
    await app.close();
  });

  it('unknown PR → 404 on both endpoints', async () => {
    const app = await appWith(new FakeIntentLLM());
    const id = '00000000-0000-4000-8000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/pulls/${id}/intent` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/pulls/${id}/intent` })).statusCode).toBe(404);
    await app.close();
  });
});
