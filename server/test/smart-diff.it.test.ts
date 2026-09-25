import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import { FakeIntentLLM } from './helpers/intent.js';
import * as t from '../src/db/schema.js';
import { randomUUID } from 'node:crypto';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('GET /pulls/:id/smart-diff (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let prId: string;
  let foreignPrId: string;

  const app = () =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        // Fail-fast stub: this route makes no LLM call, but an unstubbed provider would
        // resolve through the real secrets provider (see server/INSIGHTS.md).
        llm: { openrouter: new FakeIntentLLM(undefined, new Error('no LLM in this test')) },
      },
    });

  async function makePr(ws: string, name: string) {
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 1,
        title: 'T',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'abc',
        additions: 0,
        deletions: 0,
        filesCount: 2,
        status: 'needs_review',
        body: '',
      })
      .returning();
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/a.ts', additions: 3, deletions: 1 },
      { prId: pr!.id, path: 'README.md', additions: 1, deletions: 0 },
    ]);
    return pr!.id;
  }

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    prId = await makePr(workspaceId, 'smart-diff-a');
    const [other] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'other' } as typeof t.workspaces.$inferInsert)
      .returning();
    foreignPrId = await makePr(other!.id, 'smart-diff-b');
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('404s for an unknown PR and for a PR of another workspace', async () => {
    const a = await app();
    const unknown = await a.inject({ method: 'GET', url: `/pulls/${randomUUID()}/smart-diff` });
    expect(unknown.statusCode).toBe(404);
    const foreign = await a.inject({ method: 'GET', url: `/pulls/${foreignPrId}/smart-diff` });
    expect(foreign.statusCode).toBe(404);
    await a.close();
  });

  it('returns groups with empty finding_lines before any review, then lines after one', async () => {
    const a = await app();
    const before = await a.inject({ method: 'GET', url: `/pulls/${prId}/smart-diff` });
    expect(before.statusCode).toBe(200);
    const b = before.json();
    expect(b.groups.map((g: { role: string }) => g.role)).toEqual(['core', 'docs']);
    expect(b.groups[0].files[0].finding_lines).toEqual([]);
    expect(b.split_suggestion.total_lines).toBe(5);

    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId, kind: 'review', verdict: 'comment', summary: 's', score: 90 })
      .returning();
    await pg.handle.db.insert(t.findings).values(
      [7, 3, 7].map((line) => ({
        reviewId: review!.id,
        file: 'src/a.ts',
        startLine: line,
        endLine: line,
        severity: 'WARNING',
        category: 'bug',
        title: 't',
        rationale: 'r',
        confidence: 0.9,
      })),
    );
    const after = await a.inject({ method: 'GET', url: `/pulls/${prId}/smart-diff` });
    expect(after.statusCode).toBe(200);
    expect(after.json().groups[0].files[0].finding_lines).toEqual([3, 7]);
    await a.close();
  });
});
