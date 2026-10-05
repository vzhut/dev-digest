/**
 * repo-intel facade — `collectTourFacts` / `classifyPaths` against a real Postgres index and
 * (for the shallow / missing-sha cases) real git clones. The facts function must make 0 LLM calls
 * and be deterministic.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { loadConfig } from '../src/platform/config.js';
import { Container } from '../src/platform/container.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { FakeRepoSnapshot, MockLLMProvider } from '../src/adapters/mocks.js';
import { GitRepoSnapshot, type RepoSnapshot } from '../src/adapters/git/repo-snapshot.js';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';
import type { IndexStatus } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const SHA = 'a'.repeat(40);
/** Documented slack: the budget is 3,000 ms on a dev machine; CI VMs get 2x. */
const PERF_BUDGET_MS = process.env.CI ? 6000 : 3000;

interface SeedIndex {
  status?: IndexStatus;
  sha?: string;
  stats?: Record<string, unknown>;
  filesIndexed?: number;
  ranks?: Array<{ path: string; pagerank: number; percentile?: number }>;
  edges?: Array<{ fromFile: string; toFile: string }>;
  endpoints?: Record<string, string[]>;
}

function git(cwd: string, args: string[], date?: string): void {
  execFileSync('git', ['-C', cwd, ...args], {
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.com',
      ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
    },
  });
}

d('repo-intel facade — collectTourFacts / classifyPaths', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let tmp: string;
  const llm = new MockLLMProvider('openai');

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    tmp = mkdtempSync(join(tmpdir(), 'tour-facts-'));
  });
  afterAll(async () => {
    await pg?.stop();
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  function service(snapshot: RepoSnapshot, env: Record<string, string> = {}): RepoIntelService {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test', ...env } as NodeJS.ProcessEnv);
    const container = new Container(config, pg.handle.db, {
      repoSnapshot: snapshot,
      llm: { openai: llm, anthropic: llm, openrouter: llm },
    });
    return new RepoIntelService(container);
  }

  async function makeRepo(clonePath: string | null = '/mock/clone'): Promise<string> {
    const name = `repo-${Math.random().toString(36).slice(2)}`;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    return r!.id;
  }

  async function seedIndex(repoId: string, o: SeedIndex = {}): Promise<void> {
    const repo = new RepoIntelRepository(pg.handle.db);
    const ranks = o.ranks ?? [];
    await repo.upsertIndexState({
      repoId,
      lastIndexedSha: o.sha ?? SHA,
      indexerVersion: 2,
      status: o.status ?? 'full',
      filesIndexed: o.filesIndexed ?? ranks.length,
      filesSkipped: 0,
      stats: o.stats ?? {},
    });
    await repo.replaceFileRank(
      repoId,
      ranks.map((r, i) => ({
        filePath: r.path,
        pagerank: r.pagerank,
        hotness: 0,
        rank: r.pagerank,
        percentile: r.percentile ?? Math.max(0, 100 - i),
      })),
    );
    await repo.replaceEdges(repoId, o.edges ?? []);
    await repo.replaceFileFacts(
      repoId,
      Object.entries(o.endpoints ?? {}).map(([filePath, endpoints]) => ({ filePath, endpoints, crons: [] })),
    );
  }

  const SMALL = {
    ranks: [
      { path: 'src/server.ts', pagerank: 0.5 },
      { path: 'src/util.ts', pagerank: 0.3 },
      { path: 'src/util.test.ts', pagerank: 0.9 },
    ],
    edges: [{ fromFile: 'src/server.ts', toFile: 'src/util.ts' }],
    endpoints: { 'src/server.ts': ['GET /health'] },
  };
  const SMALL_FILES = ['package.json', 'pnpm-lock.yaml', 'README.md', ...SMALL.ranks.map((r) => r.path)];

  it('is deterministic and makes 0 LLM calls', async () => {
    const repoId = await makeRepo();
    await seedIndex(repoId, SMALL);
    const snap = new FakeRepoSnapshot({
      files: SMALL_FILES,
      texts: { 'package.json': JSON.stringify({ dependencies: { fastify: '5' }, scripts: { dev: 'x' } }), 'README.md': '# Hi' },
      churn: { commits: 5, counts: new Map([['src/util.ts', 4]]) },
    });
    const svc = service(snap);
    const before = llm.calls.length;
    const a = await svc.collectTourFacts(repoId);
    const b = await svc.collectTourFacts(repoId);
    expect(a).toEqual(b);
    expect(llm.calls.length).toBe(before);
    expect(a.index).toMatchObject({ usable: true, unusable_reason: null, files_indexed: 3, hotness_available: true });
    expect(a.source_sha).toBe(SHA);
    expect(a.readme).toEqual({ path: 'README.md', text: '# Hi' });
    expect(a.stack.map((s) => s.name)).toContain('Fastify');
    expect(a.routes).toEqual([{ method: 'GET', path: '/health', file: 'src/server.ts' }]);
    // junk (test) files never reach the reading path; hotness lifts util.ts (0.3 * 2 = 0.6 > 0.5)
    expect(a.reading_path.map((r) => r.path)).toEqual(['src/util.ts', 'src/server.ts']);
    expect(a.critical_paths.map((c) => c.path)).toContain('src/server.ts');
  });

  it('depth-1 clone: hotness unavailable, pagerank order; full history: hotness reorders', async () => {
    const src = join(tmp, 'src-repo');
    mkdirSync(join(src, 'src'), { recursive: true });
    git(src, ['init', '-q', '-b', 'main']);
    writeFileSync(join(src, 'src/a.ts'), 'export const a = 1;\n');
    writeFileSync(join(src, 'src/b.ts'), 'export const b = 1;\n');
    git(src, ['add', '.']);
    git(src, ['commit', '-q', '-m', 'one'], '2026-01-01T00:00:00Z');
    for (const [i, day] of ['02', '03'].entries()) {
      writeFileSync(join(src, 'src/b.ts'), `export const b = ${i + 2};\n`);
      git(src, ['commit', '-q', '-am', `b${day}`], `2026-01-${day}T00:00:00Z`);
    }
    const head = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD']).toString().trim();
    const shallow = join(tmp, 'shallow');
    const full = join(tmp, 'full');
    execFileSync('git', ['clone', '-q', '--depth', '1', `file://${src}`, shallow], { stdio: 'ignore' });
    execFileSync('git', ['clone', '-q', `file://${src}`, full], { stdio: 'ignore' });

    const ranks = [
      { path: 'src/a.ts', pagerank: 0.55 },
      { path: 'src/b.ts', pagerank: 0.45 },
    ];
    const svc = service(new GitRepoSnapshot());

    const shallowId = await makeRepo(shallow);
    await seedIndex(shallowId, { sha: head, ranks });
    const s = await svc.collectTourFacts(shallowId);
    expect(s.index.hotness_available).toBe(false);
    expect(s.reading_path.map((r) => r.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(s.reading_path.every((r) => r.hotness === 0)).toBe(true);

    const fullId = await makeRepo(full);
    await seedIndex(fullId, { sha: head, ranks });
    const f = await svc.collectTourFacts(fullId);
    expect(f.index.hotness_available).toBe(true);
    // a: 0.55 * (1 + 1/3) = 0.733, b: 0.45 * 2 = 0.9
    expect(f.reading_path.map((r) => r.path)).toEqual(['src/b.ts', 'src/a.ts']);

    // F7: an indexed sha the clone does not have -> unusable, tour describes HEAD
    const missingId = await makeRepo(full);
    await seedIndex(missingId, { sha: 'b'.repeat(40), ranks });
    const m = await svc.collectTourFacts(missingId);
    expect(m.index).toMatchObject({ usable: false, unusable_reason: 'sha_missing', last_indexed_sha: 'b'.repeat(40) });
    expect(m.source_sha).toBe(head);
    expect(m.reading_path).toEqual([]);

    // classifyPaths
    const kinds = await svc.classifyPaths(fullId, head, ['src/a.ts', 'src', 'src/', 'nope.ts', 'src/a']);
    expect(kinds).toEqual({ 'src/a.ts': 'file', src: 'dir', 'src/': 'dir', 'nope.ts': 'missing', 'src/a': 'missing' });
  });

  it('reports each unusable index reason', async () => {
    const snap = new FakeRepoSnapshot({ files: SMALL_FILES });
    const svc = service(snap);

    const noData = await makeRepo();
    expect((await svc.collectTourFacts(noData)).index).toMatchObject({ usable: false, unusable_reason: 'no_data', last_indexed_sha: null });

    const failed = await makeRepo();
    await seedIndex(failed, { ...SMALL, status: 'failed' });
    expect((await svc.collectTourFacts(failed)).index.unusable_reason).toBe('failed');

    const degraded = await makeRepo();
    await seedIndex(degraded, { ...SMALL, status: 'degraded' });
    expect((await svc.collectTourFacts(degraded)).index.unusable_reason).toBe('degraded');

    const noRanks = await makeRepo();
    await seedIndex(noRanks, { ranks: [] });
    const nr = await svc.collectTourFacts(noRanks);
    expect(nr.index.unusable_reason).toBe('no_ranked_files');
    expect(nr.reading_path).toEqual([]);
    // clone-derived facts are still collected for the skeleton
    expect(nr.stack.map((s) => s.name)).toContain('pnpm');

    const flagged = await makeRepo();
    await seedIndex(flagged, SMALL);
    const off = await service(snap, { REPO_INTEL_ENABLED: 'false' }).collectTourFacts(flagged);
    expect(off.index).toMatchObject({ usable: false, unusable_reason: 'flag_off' });

    // never indexed before (empty sha, F20) -> last_indexed_sha null
    const emptySha = await makeRepo();
    await seedIndex(emptySha, { ...SMALL, sha: '' });
    const e = await svc.collectTourFacts(emptySha);
    expect(e.index.last_indexed_sha).toBeNull();
    expect(e.index.usable).toBe(false);
  });

  it('files_indexed is the file_rank row count; files_total/bounded come from stats only when present (F4)', async () => {
    const svc = service(new FakeRepoSnapshot({ files: SMALL_FILES }));

    const bounded = await makeRepo();
    await seedIndex(bounded, { ...SMALL, status: 'partial', stats: { totalCandidates: 9000, bounded: 4000 }, filesIndexed: 5000 });
    expect((await svc.collectTourFacts(bounded)).index).toMatchObject({
      status: 'partial',
      files_indexed: 3,
      files_total: 9000,
      bounded: true,
    });

    // an incremental refresh: stats without totalCandidates/bounded, counter double-counted
    const incremental = await makeRepo();
    await seedIndex(incremental, { ...SMALL, stats: { incremental: true, changedFiles: 2 }, filesIndexed: 6 });
    expect((await svc.collectTourFacts(incremental)).index).toMatchObject({
      files_indexed: 3,
      files_total: null,
      bounded: false,
    });
  });

  it('collects 5,000 ranked files within the performance budget', async () => {
    const ranks = Array.from({ length: 5000 }, (_, i) => ({ path: `src/m${i % 50}/f${i}.ts`, pagerank: 1 / (i + 1) }));
    const edges = ranks.slice(1).map((r, i) => ({ fromFile: r.path, toFile: ranks[Math.floor(i / 2)]!.path }));
    const endpoints = Object.fromEntries(ranks.slice(0, 200).map((r, i) => [r.path, [`GET /r${i}`]]));
    const repoId = await makeRepo();
    await seedIndex(repoId, { ranks, edges, endpoints });
    const counts = new Map(ranks.slice(0, 500).map((r, i) => [r.path, i + 1]));
    const svc = service(new FakeRepoSnapshot({ files: ranks.map((r) => r.path), churn: { commits: 400, counts } }));

    const started = performance.now();
    const facts = await svc.collectTourFacts(repoId);
    const elapsed = performance.now() - started;

    expect(facts.index.files_indexed).toBe(5000);
    expect(facts.reading_path).toHaveLength(8);
    expect(facts.routes.length).toBeLessThanOrEqual(50);
    expect(elapsed).toBeLessThanOrEqual(PERF_BUDGET_MS);
  });
});
