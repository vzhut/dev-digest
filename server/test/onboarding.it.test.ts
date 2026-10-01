import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { Tour, type LLMProvider, type StructuredRequest, type StructuredResult, type TourFacts } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import type { ProjectDocs } from '../src/adapters/project-docs/index.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const FACTS: TourFacts = {
  source_sha: 'abc1234',
  index: {
    status: 'ready',
    reason: null,
    files_indexed: 2,
    files_skipped: 0,
    files_total: 2,
    bounded: false,
    hotness_available: true,
    usable: true,
    unusable_reason: null,
    last_indexed_sha: 'abc1234',
  },
  stack: [{ name: 'TypeScript', evidence_path: 'package.json' }],
  structure: [{ path: 'src', files: 2 }],
  routes: [],
  run_locally: [{ command: 'pnpm dev', source_path: 'package.json' }],
  critical_paths: [{ path: 'src/a.ts', computed_reason: 'imported by 2 files · rank p99' }],
  reading_path: [{ path: 'src/a.ts', score: 0.5, pagerank: 0.4, hotness: 0.25, computed_reason: 'imported by 2 files · rank p99' }],
  readme: null,
};

const OUTPUT = {
  architecture_summary_md: 'A small service.',
  architecture_diagram: null,
  critical_path_reasons: [{ path: 'src/a.ts', reason: 'Entry point.' }],
  reading_path_whys: [{ path: 'src/a.ts', why: 'Start here.' }],
  command_notes: [],
  first_tasks: [{ title: 'Add a test', path: 'src/a.ts', complexity: 'low' }],
};

/** Fail-fast stand-in for providers a test must not reach (a machine with a real key would pay). */
class FakeLlm implements LLMProvider {
  readonly id = 'openrouter' as unknown as LLMProvider['id'];
  calls = 0;
  constructor(private err?: Error) {}
  async listModels() {
    return [];
  }
  async complete(): Promise<never> {
    throw new Error('unexpected complete()');
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls += 1;
    if (this.err) throw this.err;
    return { data: OUTPUT as T, model: req.model, tokensIn: 700, tokensOut: 90, costUsd: 0.002, raw: '', attempts: 1 };
  }
  async embed(): Promise<number[][]> {
    throw new Error('unexpected embed()');
  }
}

d('onboarding module (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;
  let facts: TourFacts = FACTS;
  let indexedSha = 'abc1234';
  const db = () => pg.handle.db;

  const repoIntel = {
    collectTourFacts: async () => facts,
    classifyPaths: async (_r: string, _s: string, paths: string[]) =>
      Object.fromEntries(paths.map((p) => [p, p === 'src/a.ts' ? 'file' : 'missing'])),
    getIndexState: async () => ({ lastIndexedSha: indexedSha }),
  } as unknown as RepoIntel;
  const docs = { exists: async (dir: string) => dir.startsWith('/clones/') } as unknown as ProjectDocs;

  const appWith = (llm: FakeLlm) =>
    buildApp({
      config: config(),
      db: db(),
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        repoIntel,
        projectDocs: docs,
        // every provider the flow can reach is stubbed: openrouter is the feature default, the rest fail fast
        llm: {
          openrouter: llm,
          openai: new FakeLlm(new Error('openai must not be reached')),
          anthropic: new FakeLlm(new Error('anthropic must not be reached')),
        },
      },
    });

  const newRepo = async (clonePath: string | null, ws = workspaceId) => {
    const name = `tour-${seq++}`;
    const [r] = await db()
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    return r!;
  };

  beforeAll(async () => {
    pg = await startPg();
    await seed(db());
    workspaceId = (await db().select().from(t.workspaces))[0]!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('scopes both endpoints to the workspace (404 for a foreign or unknown repo)', async () => {
    const [other] = await db().insert(t.workspaces).values({ name: 'other', slug: `other-${seq++}` } as never).returning();
    const foreign = await newRepo('/clones/x', other!.id);
    const app = await appWith(new FakeLlm());
    for (const id of [foreign.id, '00000000-0000-4000-8000-000000000000']) {
      expect((await app.inject({ method: 'GET', url: `/repos/${id}/onboarding` })).statusCode).toBe(404);
      expect((await app.inject({ method: 'POST', url: `/repos/${id}/onboarding/generate` })).statusCode).toBe(404);
    }
    await app.close();
  });

  it('not cloned: POST → 409 not_cloned, GET → not_cloned', async () => {
    const repo = await newRepo(null);
    const llm = new FakeLlm();
    const app = await appWith(llm);
    const post = await app.inject({ method: 'POST', url: `/repos/${repo.id}/onboarding/generate` });
    expect(post.statusCode).toBe(409);
    expect(post.json().error.code).toBe('not_cloned');
    const get = await app.inject({ method: 'GET', url: `/repos/${repo.id}/onboarding` });
    expect(get.json()).toMatchObject({ status: 'not_cloned', index_sha: 'abc1234' });
    expect(get.json().tour).toBeUndefined();
    expect(llm.calls).toBe(0);
    await app.close();
  });

  it('llm, skeleton-by-index and skeleton-by-failure generations carry every AC-26 field; GET returns index_sha', async () => {
    const repo = await newRepo('/clones/acme-tour');
    const url = `/repos/${repo.id}/onboarding`;
    const llm = new FakeLlm();
    const app = await appWith(llm);

    expect((await app.inject({ method: 'GET', url })).json()).toEqual({ status: 'none', tour: null, index_sha: 'abc1234' });

    const res = await app.inject({ method: 'POST', url: `${url}/generate` });
    expect(res.statusCode).toBe(200);
    const llmTour = Tour.parse(res.json());
    expect(llmTour).toMatchObject({
      repo_id: repo.id,
      source_sha: 'abc1234',
      mode: 'llm',
      index: { status: 'ready', files_indexed: 2, hotness_available: true },
      usage: { llm_calls: 1, tokens_in: 700, tokens_out: 90, cost_usd: 0.002, model: 'openrouter/deepseek/deepseek-v4-flash', dropped_items: 0 },
    });
    expect(llmTour.usage.duration_ms).toBeGreaterThanOrEqual(0);
    expect(llmTour.architecture.summary_md).toBe('A small service.');
    expect(llmTour.first_tasks).toEqual([{ title: 'Add a test', path: 'src/a.ts', path_kind: 'file', complexity: 'low' }]);
    expect(llm.calls).toBe(1);

    const got = (await app.inject({ method: 'GET', url })).json();
    expect(got.status).toBe('ready');
    expect(got.index_sha).toBe('abc1234');
    expect(Tour.parse(got.tour)).toEqual(llmTour);
    expect(llm.calls).toBe(1);

    // an index-degraded regeneration keeps the full tour and records the attempt
    facts = { ...FACTS, index: { ...FACTS.index, usable: false, unusable_reason: 'degraded' } };
    const kept = Tour.parse((await app.inject({ method: 'POST', url: `${url}/generate` })).json());
    facts = FACTS;
    expect(kept.mode).toBe('llm');
    expect(kept.last_attempt).toMatchObject({ skeleton_reason: 'index_degraded', usage: { llm_calls: 0 } });
    const [row] = await db().select().from(t.onboarding).where(eq(t.onboarding.repoId, repo.id));
    expect(Tour.parse(row!.json).last_attempt?.skeleton_reason).toBe('index_degraded');
    expect(llm.calls).toBe(1);

    // fresh repos: skeleton by index, skeleton by failure
    const r2 = await newRepo('/clones/acme-tour-2');
    facts = { ...FACTS, index: { ...FACTS.index, usable: false, unusable_reason: 'no_data' } };
    const byIndex = Tour.parse((await app.inject({ method: 'POST', url: `/repos/${r2.id}/onboarding/generate` })).json());
    facts = FACTS;
    expect(byIndex).toMatchObject({
      mode: 'skeleton',
      skeleton_reason: 'index_degraded',
      source_sha: 'abc1234',
      usage: { llm_calls: 0, tokens_in: 0, tokens_out: 0, cost_usd: null, model: null },
      first_tasks: [],
    });
    expect(byIndex.architecture.summary_md).toBeNull();
    expect(byIndex.critical_paths[0]).toMatchObject({ reason: null, computed_reason: expect.any(String) });

    const r3 = await newRepo('/clones/acme-tour-3');
    const failing = new FakeLlm(Object.assign(new Error('schema validation failed'), { usage: { tokensIn: 500, tokensOut: 20, costUsd: 0.001 } }));
    const app2 = await appWith(failing);
    const byFailure = Tour.parse((await app2.inject({ method: 'POST', url: `/repos/${r3.id}/onboarding/generate` })).json());
    expect(byFailure).toMatchObject({
      mode: 'skeleton',
      skeleton_reason: 'llm_failed',
      usage: { llm_calls: 1, tokens_in: 500, tokens_out: 20, cost_usd: 0.001 },
    });
    expect(failing.calls).toBe(1);
    expect((await app2.inject({ method: 'GET', url: `/repos/${r3.id}/onboarding` })).json().status).toBe('ready');

    // index_sha is null when the index never recorded a commit
    indexedSha = '';
    expect((await app.inject({ method: 'GET', url })).json().index_sha).toBeNull();
    indexedSha = 'abc1234';
    await app.close();
    await app2.close();
  });
});
