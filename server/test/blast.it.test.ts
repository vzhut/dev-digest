import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlastRadius } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { setupPr } from './helpers/intent.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { BlastResult, IndexState, RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const RESULT: BlastResult = {
  changedSymbols: [{ file: 'src/config.ts', name: 'loadConfig', kind: 'function' }],
  callers: [{ file: 'src/server.ts', symbol: 'main', viaSymbol: 'loadConfig', line: 12, rank: 0.8 }],
  impactedEndpoints: ['GET /health'],
  factsByFile: { 'src/server.ts': { endpoints: ['GET /health'], crons: [] } },
  degraded: false,
};

/** Fake facade: records calls, never indexes. */
function fakeRepoIntel(): RepoIntel & { blastCalls: Array<{ repoId: string; files: string[] }> } {
  const blastCalls: Array<{ repoId: string; files: string[] }> = [];
  const state: IndexState = {
    repoId: 'x',
    status: 'full',
    filesIndexed: 3,
    filesSkipped: 0,
    durationMs: 1,
    lastIndexedSha: 'deadbeef',
    indexerVersion: 1,
    updatedAt: new Date(0),
  };
  return {
    blastCalls,
    getIndexState: async () => state,
    getBlastRadius: async (repoId: string, files: string[]) => {
      blastCalls.push({ repoId, files });
      return RESULT;
    },
  } as unknown as RepoIntel & { blastCalls: Array<{ repoId: string; files: string[] }> };
}

d('GET /pulls/:id/blast (Testcontainers pg)', () => {
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

  const appWith = (repoIntel: RepoIntel) =>
    buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient(), repoIntel },
    });

  it('returns a contract-valid map built from the PR files, and a 404 for an unknown or foreign PR', async () => {
    const ri = fakeRepoIntel();
    const app = await appWith(ri);
    const { pr } = await setupPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = BlastRadius.parse(res.json());
    expect(body.downstream[0]).toMatchObject({ symbol: 'loadConfig', endpoints_affected: ['GET /health'] });
    expect(body).toMatchObject({ degraded: false, index_status: 'full', indexed_sha: 'deadbeef' });
    expect(ri.blastCalls).toEqual([{ repoId: pr.repoId, files: ['src/config.ts'] }]);

    // Random uuid → 404 envelope.
    const missing = await app.inject({ method: 'GET', url: '/pulls/00000000-0000-4000-8000-000000000000/blast' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('not_found');

    // A PR in another workspace is invisible.
    const [ws2] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-blast' }).returning();
    const { pr: foreign } = await setupPr(pg.handle.db, ws2!.id);
    const denied = await app.inject({ method: 'GET', url: `/pulls/${foreign.id}/blast` });
    expect(denied.statusCode).toBe(404);
    await app.close();
  });
});
