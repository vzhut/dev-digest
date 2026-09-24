import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { IntentRepository, type PrIntentValues } from '../src/modules/intent/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const VALUES: PrIntentValues = {
  intent: 'Add rate limiting',
  inScope: ['limiter'],
  outOfScope: ['refactor'],
  riskAreas: ['webhooks'],
  confidence: 'medium',
  sources: [{ kind: 'pr_title', ref: 'title', status: 'used', chars: 5 }],
  missingContext: [],
  headSha: 'a1b2c3d',
  inputHash: 'h1',
  provider: 'openrouter',
  model: 'm',
  tokensIn: 10,
  tokensOut: 5,
  costUsd: 0.0003,
  durationMs: 120,
};

d('IntentRepository (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repo: IntentRepository;
  let workspaceId: string;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    workspaceId = (await pg.handle.db.select().from(t.workspaces))[0]!.id;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'intent-repo', fullName: 'acme/intent-repo' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: r!.id,
        number: 1,
        title: 'T',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'a1b2c3d',
      })
      .returning();
    prId = pr!.id;
    repo = new IntentRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('upserts one row per PR: updates in place and preserves created_at', async () => {
    expect(await repo.getIntent(workspaceId, prId)).toBeUndefined();
    const first = await repo.upsertIntent(prId, VALUES);
    await new Promise((r) => setTimeout(r, 20));
    const second = await repo.upsertIntent(prId, { ...VALUES, intent: 'Changed', confidence: 'high', costUsd: null });

    expect(second.intent).toBe('Changed');
    expect(second.confidence).toBe('high');
    expect(second.costUsd).toBeNull();
    expect(second.createdAt.getTime()).toBe(first.createdAt.getTime());
    expect(second.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
    const rows = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sources).toEqual(VALUES.sources);
  });

  it('is workspace-scoped: another workspace sees neither the PR nor its intent', async () => {
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    expect(await repo.getIntent(other!.id, prId)).toBeUndefined();
    expect(await repo.getPullForWorkspace(other!.id, prId)).toBeUndefined();
    expect((await repo.getIntent(workspaceId, prId))?.prId).toBe(prId);
  });

  it('rejects an out-of-range confidence (CHECK) and cascades with the PR', async () => {
    await expect(repo.upsertIntent(prId, { ...VALUES, confidence: 'certain' })).rejects.toThrow();
    await pg.handle.db.delete(t.pullRequests).where(eq(t.pullRequests.id, prId));
    expect(await repo.getIntent(workspaceId, prId)).toBeUndefined();
    const left = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    expect(left).toHaveLength(0);
  });
});
