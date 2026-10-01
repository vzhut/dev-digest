import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Tour } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { OnboardingRepository } from '../src/modules/onboarding/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const USAGE = {
  llm_calls: 1 as const,
  tokens_in: 8000,
  tokens_out: 1119,
  cost_usd: 0.0123,
  model: 'm',
  duration_ms: 4200,
  dropped_items: 2,
};

function makeTour(repoId: string): Tour {
  return {
    repo_id: repoId,
    generated_at: '2026-10-01T10:00:00.000Z',
    source_sha: 'abc1234',
    mode: 'llm',
    skeleton_reason: null,
    skeleton_detail: null,
    index: {
      status: 'ready',
      reason: null,
      files_indexed: 10,
      files_skipped: 1,
      files_total: 11,
      bounded: false,
      hotness_available: true,
    },
    usage: USAGE,
    architecture: {
      summary_md: 'Summary',
      diagram: 'flowchart TD\n A-->B',
      stack: [{ name: 'TypeScript', evidence_path: 'package.json' }],
      structure: [{ path: 'src', files: 9 }],
      routes: [{ method: 'GET', path: '/x', file: 'src/x.ts' }],
    },
    critical_paths: [{ path: 'src/a.ts', reason: 'core', computed_reason: 'rank 1' }],
    run_locally: [{ command: 'pnpm dev', source_path: 'package.json', note: null }],
    reading_path: [
      { path: 'src/a.ts', score: 0.9, pagerank: 0.5, hotness: 0.4, why: 'entry', computed_reason: 'top' },
    ],
    first_tasks: [{ title: 'Add test', path: 'src', path_kind: 'dir', complexity: 'low' }],
    last_attempt: {
      at: '2026-10-01T11:00:00.000Z',
      skeleton_reason: 'llm_failed',
      detail: 'boom',
      usage: { ...USAGE, llm_calls: 1, cost_usd: null },
    },
  };
}

d('OnboardingRepository (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repo: OnboardingRepository;
  let invalid: string[];
  let workspaceId: string;
  let otherWorkspaceId: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const db = pg.handle.db;
    workspaceId = (await db.select().from(t.workspaces))[0]!.id;
    const [ws2] = await db.insert(t.workspaces).values({ name: 'other' }).returning();
    otherWorkspaceId = ws2!.id;
    const [r] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'tour-repo', fullName: 'acme/tour-repo' })
      .returning();
    repoId = r!.id;
    invalid = [];
    repo = new OnboardingRepository(db, (id) => invalid.push(id));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('round-trips every Tour field and upserts in place', async () => {
    expect(await repo.getTour(workspaceId, repoId)).toBeNull();
    const tour = makeTour(repoId);
    await repo.saveTour(repoId, tour);
    expect(await repo.getTour(workspaceId, repoId)).toEqual(tour);

    const next = { ...tour, source_sha: 'def5678', last_attempt: null };
    await repo.saveTour(repoId, next);
    expect(await repo.getTour(workspaceId, repoId)).toEqual(next);
    const rows = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.generatedAt.toISOString()).toBe(tour.generated_at);
  });

  it('is workspace-scoped: another workspace gets null and no repo', async () => {
    await repo.saveTour(repoId, makeTour(repoId));
    expect(await repo.getTour(otherWorkspaceId, repoId)).toBeNull();
    expect(await repo.getRepoForWorkspace(otherWorkspaceId, repoId)).toBeUndefined();
    expect((await repo.getRepoForWorkspace(workspaceId, repoId))?.id).toBe(repoId);
  });

  it('parses stored json without a last_attempt key; treats invalid json as no tour and reports it', async () => {
    const { last_attempt: _drop, ...legacy } = makeTour(repoId);
    await pg.handle.db.update(t.onboarding).set({ json: legacy }).where(eq(t.onboarding.repoId, repoId));
    const got = await repo.getTour(workspaceId, repoId);
    expect(got?.source_sha).toBe('abc1234');
    expect(got?.last_attempt).toBeUndefined();

    await pg.handle.db.update(t.onboarding).set({ json: { nope: true } }).where(eq(t.onboarding.repoId, repoId));
    expect(await repo.getTour(workspaceId, repoId)).toBeNull();
    expect(invalid).toEqual([repoId]);
  });

  it('setLastAttempt patches only last_attempt and is a no-op without a tour', async () => {
    const { last_attempt: _drop, ...base } = makeTour(repoId);
    await repo.saveTour(repoId, base as Tour);
    const attempt = makeTour(repoId).last_attempt!;
    await repo.setLastAttempt(repoId, attempt);
    const got = await repo.getTour(workspaceId, repoId);
    expect(got?.last_attempt).toEqual(attempt);
    expect(got?.architecture.summary_md).toBe('Summary');

    const [r2] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'no-tour', fullName: 'acme/no-tour' })
      .returning();
    await repo.setLastAttempt(r2!.id, attempt);
    expect(await repo.getTour(workspaceId, r2!.id)).toBeNull();
  });
});
