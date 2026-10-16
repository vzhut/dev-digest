import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import type { CiResultArtifact, CiRunArtifactRef, CiWorkflowRun, RepoRef } from '@devdigest/shared';
import { CiIngestService } from '../src/modules/ci/ingest.service.js';
import type { CiLogger } from '../src/modules/ci/service.js';
import type { WorkspaceInstallation } from '../src/modules/ci/repository.js';
import type { CiRunRecord, CiRunRow } from '../src/modules/ci/ingest.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';

/**
 * Pull-model ingest with the real MockGitHubClient and an in-memory repository
 * fake. The fake mirrors the real contract: `hasCiRunKey` looks at the stored
 * trace key, `insertCiRun` stores one row per call.
 */

const WS = 'ws-1';
const SHA = 'd'.repeat(40);
const WORKFLOW_PATH = '.github/workflows/devdigest-review.yml';

const artifact = (over: Partial<CiResultArtifact> = {}): CiResultArtifact => ({
  artifact_version: 2,
  repository: 'acme/widgets',
  repository_id: 4242,
  head_sha: SHA,
  findings_count: 2,
  critical: 0,
  warning: 2,
  suggestion: 0,
  blockers: 0,
  verdict: 'pass',
  cost_usd: 0.01,
  duration_ms: 5000,
  agent: 'General Reviewer',
  manifest_version: 1,
  model: 'deepseek/deepseek-chat',
  runner_version: '1.0.0',
  node_version: '22.0.0',
  pr_number: 7,
  ...over,
});

const run = (id: number, over: Partial<CiWorkflowRun> = {}): CiWorkflowRun => ({
  id,
  run_attempt: 1,
  head_sha: SHA,
  path: WORKFLOW_PATH,
  status: 'completed',
  conclusion: 'success',
  html_url: `https://github.com/acme/widgets/actions/runs/${id}`,
  repository_id: 4242,
  updated_at: '2026-10-14T10:00:00Z',
  ...over,
});

const zipOf = (a: unknown) => zipSync({ 'devdigest-result.json': strToU8(JSON.stringify(a)) });
const ref = (id: number, over: Partial<CiRunArtifactRef> = {}): CiRunArtifactRef => ({
  id,
  name: 'devdigest-result',
  size_in_bytes: 500,
  expired: false,
  ...over,
});

class FakeRepo {
  installations: WorkspaceInstallation[] = [
    { id: 'inst-1', agentId: 'agent-1', agentName: 'General Reviewer', repo: 'acme/widgets' },
  ];
  stored: CiRunRecord[] = [];
  active: string[] = [];
  /** Optional hook awaited inside listWorkspaceInstallations (lock tests). */
  onList: (() => Promise<void>) | null = null;

  async listWorkspaceInstallations(): Promise<WorkspaceInstallation[]> {
    if (this.onList) await this.onList();
    return this.installations;
  }
  async hasCiRunKey(_ws: string, key: string) {
    return this.stored.some((r) => r.trace.ci_run_key === key);
  }
  async insertCiRun(record: CiRunRecord) {
    this.stored.push(record);
  }
  async markInstallationActive(id: string) {
    this.active.push(id);
  }
  async listCiRuns(): Promise<CiRunRow[]> {
    return this.stored.map((r, i) => ({
      id: `run-${i}`,
      agentId: r.run.agentId,
      ranAt: r.run.ranAt,
      status: r.run.status,
      blockers: r.run.blockers,
      findingsCount: r.run.findingsCount,
      costUsd: r.run.costUsd,
      durationMs: r.run.durationMs,
      trace: r.trace,
    }));
  }
}

function build(github: MockGitHubClient, repo = new FakeRepo()) {
  const logs: { level: string; obj: Record<string, unknown>; msg: string }[] = [];
  const log: CiLogger = {
    info: (obj, msg) => logs.push({ level: 'info', obj, msg }),
    warn: (obj, msg) => logs.push({ level: 'warn', obj, msg }),
  };
  const service = new CiIngestService({ repo, github: async () => github, log });
  return { service, repo, logs };
}

describe('CiIngestService.sync', () => {
  it('stores an accepted run once, marks the installation active and lists it', async () => {
    const github = new MockGitHubClient({
      workflowRuns: [run(1)],
      runArtifacts: { 1: [ref(10)] },
      artifactBytes: { 10: zipOf(artifact()) },
    });
    const { service, repo } = build(github);

    const out = await service.sync(WS);

    expect(out).toMatchObject({ accepted: 1, duplicates: 0, rejected: 0 });
    expect(out.runs).toHaveLength(1);
    expect(out.runs[0]).toMatchObject({
      agent_name: 'General Reviewer',
      repo: 'acme/widgets',
      pr_number: 7,
      status: 'done',
      verdict: 'pass',
      findings_count: 2,
      job_url: 'https://github.com/acme/widgets/actions/runs/1',
    });
    expect(repo.stored).toHaveLength(1);
    expect(repo.stored[0]!.trace.ci_run_key).toBe('1:1');
    expect(repo.active).toEqual(['inst-1']);
    expect(github.workflowRunCalls).toEqual([
      { repo: { owner: 'acme', name: 'widgets' }, workflowFile: 'devdigest-review.yml', perPage: 30 },
    ]);
  });

  it('counts a replay of the same run.id:attempt as a duplicate and stores it once; a new attempt is a new run', async () => {
    const github = new MockGitHubClient({
      workflowRuns: [run(1)],
      runArtifacts: { 1: [ref(10)] },
      artifactBytes: { 10: zipOf(artifact()) },
    });
    const { service, repo } = build(github);

    await service.sync(WS);
    const replay = await service.sync(WS);
    expect(replay).toMatchObject({ accepted: 0, duplicates: 1, rejected: 0 });
    expect(repo.stored).toHaveLength(1);
    // the duplicate is not downloaded again
    expect(github.artifactDownloads).toHaveLength(1);

    const rerun = new MockGitHubClient({
      workflowRuns: [run(1), run(1, { run_attempt: 2 })],
      runArtifacts: { 1: [ref(10)] },
      artifactBytes: { 10: zipOf(artifact()) },
    });
    const second = new CiIngestService({
      repo,
      github: async () => rerun,
      log: { info: () => {}, warn: () => {} },
    });
    expect(await second.sync(WS)).toMatchObject({ accepted: 1, duplicates: 1 });
    expect(repo.stored.map((r) => r.trace.ci_run_key)).toEqual(['1:1', '1:2']);
  });

  it('rejects a forged artifact (other repository id or other commit), stores nothing and logs the reason only', async () => {
    const github = new MockGitHubClient({
      workflowRuns: [run(1), run(2)],
      runArtifacts: { 1: [ref(10)], 2: [ref(20)] },
      artifactBytes: {
        10: zipOf(artifact({ repository_id: 999, agent: 'SECRET-AGENT-BODY' })),
        20: zipOf(artifact({ head_sha: 'e'.repeat(40) })),
      },
    });
    const { service, repo, logs } = build(github);

    const out = await service.sync(WS);

    expect(out).toMatchObject({ accepted: 0, duplicates: 0, rejected: 2, runs: [] });
    expect(repo.stored).toHaveLength(0);
    expect(repo.active).toEqual([]);
    const reasons = logs.filter((l) => l.msg === 'ci run rejected').map((l) => l.obj.reason);
    expect(reasons).toEqual(['repository_mismatch', 'sha_mismatch']);
    expect(JSON.stringify(logs)).not.toContain('SECRET-AGENT-BODY');
  });

  it('rejects a run of another workflow file and malformed or oversized artifacts without storing', async () => {
    const github = new MockGitHubClient({
      workflowRuns: [run(1, { path: '.github/workflows/evil.yml' }), run(2), run(3)],
      runArtifacts: { 2: [ref(20)], 3: [ref(30, { size_in_bytes: 1024 * 1024 })] },
      artifactBytes: { 20: strToU8('not a zip') },
    });
    const { service, repo, logs } = build(github);

    const out = await service.sync(WS);

    expect(out).toMatchObject({ accepted: 0, rejected: 3 });
    expect(repo.stored).toHaveLength(0);
    expect(logs.filter((l) => l.msg === 'ci run rejected').map((l) => l.obj.reason)).toEqual([
      'workflow_path_mismatch',
      'unzip_failed',
      'artifact_too_large',
    ]);
    // the oversized artifact is refused from its metadata, before any download
    expect(github.artifactDownloads.map((d) => d.artifactId)).toEqual([20]);
    // the foreign workflow run is not even asked for artifacts
    expect(github.artifactListCalls.map((c) => c.runId)).toEqual([2, 3]);
  });

  it('stores a run without a usable artifact as failed/skipped and ignores runs that are not completed', async () => {
    const github = new MockGitHubClient({
      workflowRuns: [
        run(1, { conclusion: 'failure' }),
        run(2, { conclusion: 'skipped' }),
        run(3, { conclusion: 'success' }), // artifact expired
        run(4, { status: 'in_progress', conclusion: null }),
      ],
      runArtifacts: { 3: [ref(30, { expired: true })] },
    });
    const { service, repo } = build(github);

    const out = await service.sync(WS);

    expect(out).toMatchObject({ accepted: 3, rejected: 0 });
    expect(repo.stored.map((r) => [r.trace.ci_run_key, r.run.status, r.run.error])).toEqual([
      ['1:1', 'failed', 'no result artifact'],
      ['2:1', 'skipped', 'no result artifact'],
      ['3:1', 'skipped', 'no result artifact'],
    ]);
    expect(out.runs.map((r) => r.status)).toEqual(['failed', 'skipped', 'skipped']);
    expect(github.artifactListCalls.map((c) => c.runId)).toEqual([1, 2, 3]);
  });

  it('skips a run whose artifact download fails and retries it on the next sync', async () => {
    class Flaky extends MockGitHubClient {
      fail = true;
      async downloadArtifact(r: RepoRef, id: number) {
        if (this.fail) throw Object.assign(new Error('boom'), { status: 502 });
        return super.downloadArtifact(r, id);
      }
    }
    const github = new Flaky({
      workflowRuns: [run(1)],
      runArtifacts: { 1: [ref(10)] },
      artifactBytes: { 10: zipOf(artifact()) },
    });
    const { service, repo, logs } = build(github);

    expect(await service.sync(WS)).toMatchObject({ accepted: 0, rejected: 0 });
    expect(repo.stored).toHaveLength(0);
    expect(logs.some((l) => l.msg === 'ci artifact fetch failed')).toBe(true);

    github.fail = false;
    expect(await service.sync(WS)).toMatchObject({ accepted: 1 });
  });

  it('one failing installation does not stop the loop', async () => {
    class PerRepo extends MockGitHubClient {
      async listWorkflowRuns(r: RepoRef, file: string, opts: { perPage: number }) {
        if (r.name === 'broken') throw Object.assign(new Error('gone'), { status: 404 });
        return super.listWorkflowRuns(r, file, opts);
      }
    }
    const github = new PerRepo({
      workflowRuns: [run(5)],
      runArtifacts: { 5: [ref(50)] },
      artifactBytes: { 50: zipOf(artifact()) },
    });
    const repo = new FakeRepo();
    repo.installations = [
      { id: 'inst-bad', agentId: 'agent-1', agentName: 'General Reviewer', repo: 'acme/broken' },
      { id: 'inst-ok', agentId: 'agent-1', agentName: 'General Reviewer', repo: 'acme/widgets' },
    ];
    const { service, logs } = build(github, repo);

    const out = await service.sync(WS);

    expect(out).toMatchObject({ accepted: 1, rejected: 0 });
    expect(repo.active).toEqual(['inst-ok']);
    const warn = logs.find((l) => l.msg === 'ci sync failed for installation')!;
    expect(warn.obj).toEqual({ repo: 'acme/broken', status: 404 });
  });

  it('does not call GitHub when the workspace has no installations', async () => {
    const github = new MockGitHubClient();
    const repo = new FakeRepo();
    repo.installations = [];
    const { service } = build(github, repo);
    expect(await service.sync(WS)).toEqual({ runs: [], accepted: 0, duplicates: 0, rejected: 0 });
    expect(github.workflowRunCalls).toHaveLength(0);
  });

  it('serializes concurrent syncs of one workspace but not of different workspaces', async () => {
    const github = new MockGitHubClient();
    const repo = new FakeRepo();
    let inFlight = 0;
    let maxInFlight = 0;
    const release: (() => void)[] = [];
    repo.onList = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((resolve) => release.push(resolve));
      inFlight -= 1;
    };
    const { service } = build(github, repo);
    const tick = () => new Promise((r) => setTimeout(r, 5));

    const a1 = service.sync('ws-a');
    const a2 = service.sync('ws-a');
    await tick();
    // only the first sync of ws-a has started
    expect(release).toHaveLength(1);
    expect(inFlight).toBe(1);

    // a different workspace is not blocked by ws-a
    const b = service.sync('ws-b');
    await tick();
    expect(release).toHaveLength(2);
    expect(maxInFlight).toBe(2);

    release[0]!();
    await tick();
    // the second ws-a sync starts only after the first finished
    expect(release).toHaveLength(3);
    release[1]!();
    release[2]!();
    await Promise.all([a1, a2, b]);
    expect(inFlight).toBe(0);
  });

  it('a failing sync does not poison the lock for the next one', async () => {
    const github = new MockGitHubClient();
    const repo = new FakeRepo();
    let first = true;
    repo.onList = async () => {
      if (first) {
        first = false;
        throw new Error('db down');
      }
    };
    const { service } = build(github, repo);
    await expect(service.sync(WS)).rejects.toThrow('db down');
    await expect(service.sync(WS)).resolves.toMatchObject({ accepted: 0 });
  });
});
