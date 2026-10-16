import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { strToU8, zipSync } from 'fflate';
import type { RepoRef } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { CiRepository } from '../src/modules/ci/repository.js';
import { CiIngestService } from '../src/modules/ci/ingest.service.js';
import { toCiRunRecord, type CiRunRecord } from '../src/modules/ci/ingest.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const SHA = 'f'.repeat(40);

/** Real Postgres: ci_installations upsert, atomic agent_runs + run_traces insert, idempotency key. */
d('ci repository (Postgres)', () => {
  let pg: PgFixture;
  let repo: CiRepository;
  let workspaceId: string;
  let agentId: string;
  let otherAgentId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    repo = new CiRepository(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces).limit(1);
    workspaceId = ws!.id;
    const mk = async (name: string) =>
      (
        await pg.handle.db
          .insert(t.agents)
          .values({ workspaceId, name, provider: 'openrouter', model: 'x/y', systemPrompt: 'p' })
          .returning()
      )[0]!.id;
    agentId = await mk('CI Agent One');
    otherAgentId = await mk('CI Agent Two');
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const values = (over: Partial<Parameters<CiRepository['upsertInstallation']>[0]> = {}) => ({
    agentId,
    repo: 'acme/widgets',
    manifestVersion: 1,
    workflowVersion: 1,
    prUrl: 'https://github.com/acme/widgets/pull/1',
    status: 'pending' as const,
    ...over,
  });

  it('upsertInstallation inserts once per (agent, repo) and updates the same row on conflict', async () => {
    const first = await repo.upsertInstallation(values());
    expect(first).toMatchObject({ agentId, repo: 'acme/widgets', targetType: 'gha', status: 'pending', manifestVersion: 1 });

    const second = await repo.upsertInstallation(values({ manifestVersion: 4, prUrl: null }));
    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({ manifestVersion: 4, prUrl: null, status: 'pending' });
    expect(second.installedAt.getTime()).toBeGreaterThanOrEqual(first.installedAt.getTime());

    const rows = await pg.handle.db.select().from(t.ciInstallations).where(and(eq(t.ciInstallations.agentId, agentId), eq(t.ciInstallations.repo, 'acme/widgets')));
    expect(rows).toHaveLength(1);

    // a different repo or a different agent is a separate installation
    const otherRepo = await repo.upsertInstallation(values({ repo: 'acme/other' }));
    const otherAgent = await repo.upsertInstallation(values({ agentId: otherAgentId }));
    expect(new Set([first.id, otherRepo.id, otherAgent.id]).size).toBe(3);
  });

  it('otherAgentInstalled names another agent of the workspace in the repo, never the same agent', async () => {
    expect(await repo.otherAgentInstalled(workspaceId, 'acme/widgets', agentId)).toBe('CI Agent Two');
    expect(await repo.otherAgentInstalled(workspaceId, 'acme/other', agentId)).toBeNull();
  });

  it('markInstallationActive flips the status and listInstallations reports it', async () => {
    const inst = await repo.upsertInstallation(values({ repo: 'acme/active-me' }));
    await repo.markInstallationActive(inst.id);
    const listed = await repo.listInstallations(workspaceId, agentId);
    expect(listed.find((l) => l.row.id === inst.id)!.row.status).toBe('active');
  });

  const record = (key: number, over: Partial<CiRunRecord['run']> = {}): CiRunRecord => {
    const rec = toCiRunRecord(
      { workspaceId, agentId, agentName: 'CI Agent One', repo: 'acme/widgets' },
      {
        id: key,
        run_attempt: 1,
        head_sha: SHA,
        path: '.github/workflows/devdigest-review.yml',
        status: 'completed',
        conclusion: 'failure',
        html_url: `https://github.com/acme/widgets/actions/runs/${key}`,
        repository_id: 1,
        updated_at: '2026-10-14T10:00:00Z',
      },
      null,
    );
    return { ...rec, run: { ...rec.run, ...over } };
  };

  it('insertCiRun writes agent_runs (pr_id null, source ci) and run_traces; hasCiRunKey sees it', async () => {
    expect(await repo.hasCiRunKey(workspaceId, '777:1')).toBe(false);
    await repo.insertCiRun(record(777));

    const [row] = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .innerJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
      .where(sql`${t.runTraces.trace}->>'ci_run_key' = '777:1'`);
    expect(row!.agent_runs).toMatchObject({ prId: null, source: 'ci', status: 'failed', provider: 'openrouter', workspaceId, agentId });
    expect(row!.run_traces.trace).toMatchObject({ source: 'ci', ci_run_key: '777:1', repo: 'acme/widgets' });

    expect(await repo.hasCiRunKey(workspaceId, '777:1')).toBe(true);
    expect(await repo.hasCiRunKey(workspaceId, '777:2')).toBe(false);
    // keys are scoped to the workspace
    expect(await repo.hasCiRunKey('00000000-0000-0000-0000-000000000000', '777:1')).toBe(false);
  });

  it('insertCiRun is atomic: a failing run_traces insert leaves no agent_runs row behind', async () => {
    const poisoned = record(888);
    // Postgres jsonb rejects \u0000, so the SECOND insert (run_traces) fails after agent_runs succeeded.
    poisoned.trace.agent_name = 'bad\u0000name';
    await expect(repo.insertCiRun(poisoned)).rejects.toThrow();

    const leftovers = await pg.handle.db.select().from(t.agentRuns).where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.source, 'ci')));
    expect(leftovers.every((r) => r.agentId === agentId)).toBe(true);
    expect(await repo.hasCiRunKey(workspaceId, '888:1')).toBe(false);
    const countBefore = leftovers.length;
    // exactly the rows of the earlier successful inserts (no orphan from the failed one)
    const withTrace = await repo.listCiRuns(workspaceId);
    expect(withTrace.length).toBe(countBefore);
  });

  it('listCiRuns returns CI runs only, newest first', async () => {
    await repo.insertCiRun(record(901, { ranAt: new Date('2026-10-14T12:00:00Z') }));
    await repo.insertCiRun(record(902, { ranAt: new Date('2026-10-14T13:00:00Z') }));
    // a local run must not show up
    await pg.handle.db.insert(t.agentRuns).values({ workspaceId, agentId, status: 'done', source: 'local' });

    const rows = await repo.listCiRuns(workspaceId);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const times = rows.map((r) => r.ranAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(rows.every((r) => (r.trace as { source?: string }).source === 'ci')).toBe(true);
  });

  it('sync end to end: ingest through the real repository stores a verified run once', async () => {
    await repo.upsertInstallation(values({ repo: 'acme/e2e', prUrl: null }));
    const artifact = {
      artifact_version: 2,
      repository: 'acme/e2e',
      repository_id: 55,
      head_sha: SHA,
      findings_count: 1,
      blockers: 1,
      verdict: 'fail',
      cost_usd: 0.002,
      agent: 'CI Agent One',
      model: 'x/y',
      runner_version: '1.0.0',
      node_version: '22.0.0',
      pr_number: 3,
    };
    // the mock answers every repo alike; only acme/e2e has runs here
    class OnlyE2e extends MockGitHubClient {
      async listWorkflowRuns(r: RepoRef, file: string, opts: { perPage: number }) {
        return r.name === 'e2e' ? super.listWorkflowRuns(r, file, opts) : [];
      }
    }
    const github = new OnlyE2e({
      workflowRuns: [
        {
          id: 5150,
          run_attempt: 1,
          head_sha: SHA,
          path: '.github/workflows/devdigest-review.yml',
          status: 'completed',
          conclusion: 'success',
          html_url: 'https://github.com/acme/e2e/actions/runs/5150',
          repository_id: 55,
          updated_at: '2026-10-14T14:00:00Z',
        },
      ],
      runArtifacts: { 5150: [{ id: 1, name: 'devdigest-result', size_in_bytes: 400, expired: false }] },
      artifactBytes: { 1: zipSync({ 'devdigest-result.json': strToU8(JSON.stringify(artifact)) }) },
    });
    const service = new CiIngestService({ repo, github: async () => github, log: { info: () => {}, warn: () => {} } });

    const first = await service.sync(workspaceId);
    expect(first.accepted).toBe(1);
    const item = first.runs.find((r) => r.job_url.endsWith('/5150'))!;
    expect(item).toMatchObject({ pr_number: 3, status: 'done', verdict: 'fail', blockers: 1, repo: 'acme/e2e' });

    const again = await service.sync(workspaceId);
    expect(again.accepted).toBe(0);
    expect(again.duplicates).toBe(1);
    expect(again.runs.filter((r) => r.job_url.endsWith('/5150'))).toHaveLength(1);

    const inst = (await repo.listInstallations(workspaceId, agentId)).find((l) => l.row.repo === 'acme/e2e')!;
    expect(inst.row.status).toBe('active');
  });
});
