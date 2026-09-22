/**
 * Conventions Extractor — extract/get round-trip against real Postgres, with
 * a mock LLM and mock GitClient (§9 `.it.test.ts` list): persisted rows +
 * scan counts, index-off → 409, no-clone → 409, workspace isolation, repo
 * delete cascades, and re-scan keeping a decided row (§4.5) while replacing
 * the rest.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { ConventionsService } from '../src/modules/conventions/service.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const SOURCE_PATH = 'src/a.ts';
const SOURCE_CONTENT = 'await foo()\nawait bar()\n';

const EXTRACTION_FIXTURE = {
  candidates: [
    {
      category: 'style',
      rule: 'Use async/await, not .then()',
      evidence: { path: SOURCE_PATH, line_start: 1, line_end: 1, quote: 'await foo()' },
      confidence: 0.9,
    },
  ],
};

/** Just enough of RepoIntel for the extractor — the rest is never called. */
function fakeRepoIntel(samples: string[]): RepoIntel {
  return { getConventionSamples: async () => samples } as unknown as RepoIntel;
}

d('conventions module — extract/get', () => {
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

  async function makeRepo(clonePath: string | null = '/mock/clones/acme/big'): Promise<string> {
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `repo-${Date.now()}-${Math.random()}`, fullName: `acme/repo-${Date.now()}`, clonePath })
      .returning();
    return r!.id;
  }

  function makeApp(opts: { repoIntel?: RepoIntel } = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ head: 'sha-abc123', files: { [SOURCE_PATH]: SOURCE_CONTENT } }),
        github: new MockGitHubClient(),
        llm: { openrouter: new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: EXTRACTION_FIXTURE } }) },
        repoIntel: opts.repoIntel ?? fakeRepoIntel([SOURCE_PATH]),
      },
    });
  }

  it('extract persists a scan + kept candidates, with a working evidence URL', async () => {
    const app = await makeApp();
    const repoId = await makeRepo();

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.scan).toMatchObject({ sha: 'sha-abc123', raw_count: 1, kept_count: 1 });
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0]).toMatchObject({
      rule: 'Use async/await, not .then()',
      status: 'pending',
      edited: false,
      evidence_path: SOURCE_PATH,
    });
    const [repoRow] = await pg.handle.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    expect(body.candidates[0].evidence_url).toBe(
      `https://github.com/acme/${repoRow!.name}/blob/sha-abc123/${SOURCE_PATH}#L1-L1`,
    );

    const [scanRow] = await pg.handle.db.select().from(t.conventionScans).where(eq(t.conventionScans.repoId, repoId));
    expect(scanRow).toMatchObject({ sha: 'sha-abc123', keptCount: 1, model: 'openrouter/deepseek/deepseek-v4-flash' });
    const rows = await pg.handle.db.select().from(t.conventions).where(eq(t.conventions.repoId, repoId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'pending', rule: 'Use async/await, not .then()' });

    const get = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(get.json()).toEqual(body);
    await app.close();
  });

  it('a repo with no clone → 409, before any repo-intel/LLM call', async () => {
    const app = await makeApp();
    const repoId = await makeRepo(null);
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('not_cloned');
    await app.close();
  });

  it('an unindexed repo (no sample files) → 409, never a silent empty scan', async () => {
    const app = await makeApp({ repoIntel: fakeRepoIntel([]) });
    const repoId = await makeRepo();
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('not_indexed');
    const rows = await pg.handle.db.select().from(t.conventionScans).where(eq(t.conventionScans.repoId, repoId));
    expect(rows).toHaveLength(0); // no half-written scan
    await app.close();
  });

  it('workspace isolation: another workspace cannot see or extract into this repo', async () => {
    const app = await makeApp();
    const repoId = await makeRepo();
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });

    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${Date.now()}` }).returning();
    const svc = new ConventionsService(app.container);
    await expect(svc.get(other!.id, repoId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(svc.extract(other!.id, repoId)).rejects.toMatchObject({ statusCode: 404 });
    await app.close();
  });

  it('deleting the repo cascades to both convention_scans and conventions', async () => {
    const app = await makeApp();
    const repoId = await makeRepo();
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });

    await pg.handle.db.delete(t.repos).where(eq(t.repos.id, repoId));

    const scans = await pg.handle.db.select().from(t.conventionScans).where(eq(t.conventionScans.repoId, repoId));
    const rows = await pg.handle.db.select().from(t.conventions).where(eq(t.conventions.repoId, repoId));
    expect(scans).toHaveLength(0);
    expect(rows).toHaveLength(0);
    await app.close();
  });

  it('re-scan (§4.5): a decided row survives and is not resurrected as a new pending candidate', async () => {
    const app = await makeApp();
    const repoId = await makeRepo();
    const first = (await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })).json();
    const decidedId = first.candidates[0].id;

    // Simulate "accepted" directly (PATCH lands in slice 4) so the re-scan
    // semantics can be proven now: the decided row must survive verbatim.
    await pg.handle.db.update(t.conventions).set({ status: 'accepted' }).where(eq(t.conventions.id, decidedId));

    const second = (await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })).json();
    // Same fingerprint, same row (not duplicated), still accepted — the model
    // fixture re-proposes the identical rule on every call.
    expect(second.candidates).toHaveLength(1);
    expect(second.candidates[0].id).toBe(decidedId);
    expect(second.candidates[0].status).toBe('accepted');

    const scanTwo = await pg.handle.db
      .select()
      .from(t.conventionScans)
      .where(eq(t.conventionScans.repoId, repoId));
    expect(scanTwo).toHaveLength(2); // both scans recorded
    expect(second.scan.kept_count).toBe(0); // the only candidate was already decided — nothing NEW kept
    await app.close();
  });
});
