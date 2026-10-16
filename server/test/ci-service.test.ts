import { describe, it, expect, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import type { CiExportRequest, CommitFilesPayload, RepoRef } from '@devdigest/shared';
import { CiExportService, type CiAgentsPort, type CiLogger } from '../src/modules/ci/service.js';
import type { UpsertInstallation } from '../src/modules/ci/repository.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import { AppError, NotFoundError } from '../src/platform/errors.js';
import type { AgentRow, CiInstallationRow, RepoRow, SkillRow } from '../src/db/rows.js';

/**
 * CiExportService with the real MockGitHubClient (an unmanaged dependency) and
 * in-memory fakes for the narrow deps (repository, agents port, runner bundle,
 * log). The repository's SQL is covered by ci.it.test.ts.
 */

const WS = 'ws-1';
const AGENT_ID = '00000000-0000-0000-0000-0000000000a1';
const REPO_ID = '00000000-0000-0000-0000-0000000000b1';
const RUNNER = 'RUNNER-BUNDLE-SOURCE';

const agentRow = (over: Partial<AgentRow> = {}): AgentRow =>
  ({
    id: AGENT_ID,
    workspaceId: WS,
    name: 'General Reviewer',
    provider: 'openrouter',
    model: 'deepseek/deepseek-chat',
    systemPrompt: 'You review code.',
    strategy: 'single-pass',
    ciFailOn: 'critical',
    version: 3,
    ...over,
  }) as AgentRow;

const repoRow: RepoRow = { id: REPO_ID, workspaceId: WS, owner: 'acme', name: 'widgets', fullName: 'acme/widgets' } as RepoRow;

const request = (over: Partial<CiExportRequest> = {}): CiExportRequest => ({
  repo_id: REPO_ID,
  triggers: ['opened', 'synchronize'],
  post_as: 'github_review',
  ...over,
});

class FakeCiRepo {
  upserts: UpsertInstallation[] = [];
  other: string | null = null;
  repos: RepoRow[] = [repoRow];
  rows: { row: CiInstallationRow; repoId: string | null }[] = [];

  async getRepoForWorkspace(workspaceId: string, repoId: string) {
    return this.repos.find((r) => r.workspaceId === workspaceId && r.id === repoId);
  }
  async otherAgentInstalled() {
    return this.other;
  }
  async upsertInstallation(values: UpsertInstallation): Promise<CiInstallationRow> {
    this.upserts.push(values);
    return {
      id: 'inst-1',
      targetType: 'gha',
      installedAt: new Date('2026-10-14T09:00:00Z'),
      ...values,
    } as CiInstallationRow;
  }
  async listInstallations() {
    return this.rows;
  }
}

function build(opts: { agent?: AgentRow | undefined; github?: MockGitHubClient; runner?: string | null; skills?: { name: string; enabled?: boolean }[] } = {}) {
  const repo = new FakeCiRepo();
  const github = opts.github ?? new MockGitHubClient();
  const githubFactory = vi.fn(async () => github);
  const logs: { level: string; obj: Record<string, unknown>; msg: string }[] = [];
  const log: CiLogger = {
    info: (obj, msg) => logs.push({ level: 'info', obj, msg }),
    warn: (obj, msg) => logs.push({ level: 'warn', obj, msg }),
  };
  const agent = 'agent' in opts ? opts.agent : agentRow();
  const agents: CiAgentsPort = {
    getById: async (_ws, id) => (agent && agent.id === id ? agent : undefined),
    linkedSkills: async () =>
      (opts.skills ?? []).map((s, i) => ({
        skill: { name: s.name, body: `body of ${s.name}`, version: i + 1 } as SkillRow,
        order: i,
        enabled: s.enabled ?? true,
      })),
  };
  const service = new CiExportService({
    repo,
    agents,
    github: githubFactory,
    readRunnerBundle: async () => ('runner' in opts ? opts.runner! : RUNNER),
    log,
  });
  return { service, repo, github, githubFactory, logs };
}

const failingGithub = (status: number, phase: 'commit' | 'branch' = 'commit') => {
  class Failing extends MockGitHubClient {
    async commitFiles(_r: RepoRef, _p: CommitFilesPayload): Promise<{ branch: string }> {
      throw Object.assign(new Error('Resource not accessible https://api.github.com/x'), { status });
    }
    async getDefaultBranch(_r: RepoRef): Promise<string> {
      if (phase === 'branch') throw Object.assign(new Error('nope'), { status });
      return 'main';
    }
  }
  return new Failing();
};

/** Run `fn` and return the AppError it rejects with. */
async function rejection(fn: () => Promise<unknown>): Promise<AppError> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    return err as AppError;
  }
  throw new Error('expected a rejection');
}

describe('CiExportService.preview', () => {
  it('returns the bundle with a runner placeholder, no violations and no GitHub call', async () => {
    const { service, githubFactory } = build({ skills: [{ name: 'API Gate' }, { name: 'Off', enabled: false }] });
    const out = await service.preview(WS, AGENT_ID, request());
    expect(out.files.map((f) => f.path)).toEqual([
      '.devdigest/agents/general-reviewer.yaml',
      '.devdigest/skills/api-gate.md',
      '.devdigest/memory.jsonl',
      '.devdigest/runner/index.mjs',
      '.github/workflows/devdigest-review.yml',
    ]);
    const runner = out.files.find((f) => f.path === '.devdigest/runner/index.mjs')!;
    expect(runner.contents).toBe(`// bundled agent-runner, ${RUNNER.length} bytes`);
    expect(out.workflow_violations).toEqual([]);
    expect(out.warnings).toEqual([]);
    expect(githubFactory).not.toHaveBeenCalled();
  });

  it('reports violations of an edited workflow instead of throwing', async () => {
    const { service } = build();
    const out = await service.preview(WS, AGENT_ID, request({ workflow: 'on: pull_request_target\njobs: {}\n' }));
    expect(out.workflow_violations.map((v) => v.rule)).toEqual(['forbidden_trigger']);
    expect(out.files.find((f) => f.path.endsWith('devdigest-review.yml'))!.contents).toContain('pull_request_target');
  });

  it('warns when another agent is already installed in the repository', async () => {
    const { service, repo } = build();
    repo.other = 'Security Reviewer';
    const out = await service.preview(WS, AGENT_ID, request());
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0]).toContain('Security Reviewer');
  });

  it('refuses a non-OpenRouter agent with 422 agent_not_exportable', async () => {
    const { service } = build({ agent: agentRow({ provider: 'openai' }) });
    const err = await rejection(() => service.preview(WS, AGENT_ID, request()));
    expect(err).toMatchObject({ code: 'agent_not_exportable', statusCode: 422, details: { provider: 'openai' } });
  });

  it('answers 404 for an unknown agent, 404 no_repository for an unknown repo, 409 runner_bundle_missing without a bundle', async () => {
    await expect(build({ agent: undefined }).service.preview(WS, AGENT_ID, request())).rejects.toBeInstanceOf(NotFoundError);

    const noRepo = await rejection(() => build().service.preview(WS, AGENT_ID, request({ repo_id: '00000000-0000-0000-0000-00000000ffff' })));
    expect(noRepo).toMatchObject({ code: 'no_repository', statusCode: 404 });

    const noBundle = await rejection(() => build({ runner: null }).service.preview(WS, AGENT_ID, request()));
    expect(noBundle).toMatchObject({ code: 'runner_bundle_missing', statusCode: 409 });
  });
});

describe('CiExportService.install', () => {
  it('commits the bundle onto devdigest/ci, opens a PR against the default branch and upserts a pending installation', async () => {
    const { service, github, repo } = build({ github: new MockGitHubClient({ defaultBranch: 'master' }) });
    const out = await service.install(WS, AGENT_ID, request());

    expect(github.committed).toHaveLength(1);
    expect(github.committed[0]).toMatchObject({ branch: 'devdigest/ci', base: 'master' });
    expect(github.committed[0]!.files.map((f) => f.path)).toContain('.devdigest/runner/index.mjs');
    expect(github.committed[0]!.files.find((f) => f.path === '.devdigest/runner/index.mjs')!.contents).toBe(RUNNER);
    expect(github.openedPrs).toHaveLength(1);
    expect(github.openedPrs[0]).toMatchObject({ head: 'devdigest/ci', base: 'master', title: 'Add DevDigest CI review' });

    expect(repo.upserts).toEqual([
      { agentId: AGENT_ID, repo: 'acme/widgets', manifestVersion: 3, workflowVersion: 1, prUrl: out.pr_url, status: 'pending' },
    ]);
    expect(out.pr_url).toBe('https://github.com/mock/mock/pull/1');
    expect(out.installation).toMatchObject({ id: 'inst-1', agent_id: AGENT_ID, repo: 'acme/widgets', repo_id: REPO_ID, status: 'pending', target_type: 'gha' });
  });

  it('logs the target, branch, base and outcome of a successful install (no token, no artifact data)', async () => {
    const { service, logs } = build({ github: new MockGitHubClient({ defaultBranch: 'master' }) });
    const out = await service.install(WS, AGENT_ID, request());
    const ok = logs.find((l) => l.msg === 'ci install pr ready')!;
    expect(ok.level).toBe('info');
    expect(ok.obj).toEqual({
      agentId: AGENT_ID,
      repo: 'acme/widgets',
      target: 'github_actions',
      branch: 'devdigest/ci',
      base: 'master',
      outcome: 'pr_ready',
      pr_url: out.pr_url,
    });
  });

  it('uses the base branch GitHub reports, not the stored default_branch (non-main default)', async () => {
    const { service, github } = build({ github: new MockGitHubClient({ defaultBranch: 'trunk' }) });
    await service.install(WS, AGENT_ID, request());
    expect(github.committed[0]!.base).toBe('trunk');
    expect(github.openedPrs[0]!.base).toBe('trunk');
  });

  it('reuses an already open install PR on a second export instead of opening another', async () => {
    const { service, github } = build();
    await service.install(WS, AGENT_ID, request());
    const second = await service.install(WS, AGENT_ID, request({ triggers: ['opened'] }));
    expect(github.committed).toHaveLength(2);
    expect(github.openedPrs).toHaveLength(1);
    expect(second.pr_url).toBe('https://github.com/mock/mock/pull/1');
  });

  it('rejects an invalid workflow with 422 workflow_invalid and makes no GitHub call and no upsert', async () => {
    const { service, github, githubFactory, repo } = build();
    const bad = 'on: pull_request_target\npermissions: write-all\njobs: {}\n';
    const err = await rejection(() => service.install(WS, AGENT_ID, request({ workflow: bad })));
    expect(err).toMatchObject({ code: 'workflow_invalid', statusCode: 422 });
    const rules = (err.details as { violations: { rule: string }[] }).violations.map((v) => v.rule);
    expect(rules.sort()).toEqual(['extra_permissions', 'forbidden_trigger']);
    expect(githubFactory).not.toHaveBeenCalled();
    expect(github.committed).toHaveLength(0);
    expect(github.openedPrs).toHaveLength(0);
    expect(repo.upserts).toHaveLength(0);
  });

  it('refuses a non-OpenRouter agent before touching GitHub', async () => {
    const { service, githubFactory } = build({ agent: agentRow({ provider: 'anthropic' }) });
    await expect(service.install(WS, AGENT_ID, request())).rejects.toMatchObject({ code: 'agent_not_exportable' });
    expect(githubFactory).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'token_missing'],
    [403, 'token_permission_missing'],
    [404, 'repo_not_accessible'],
    [500, 'github_unavailable'],
  ])('maps a GitHub %i to %s, stores no installation and logs without the SDK text', async (status, code) => {
    const { service, repo, logs } = build({ github: failingGithub(status) });
    const err = await rejection(() => service.install(WS, AGENT_ID, request()));
    expect(err.code).toBe(code);
    expect(err.message).not.toContain('api.github.com');
    expect(repo.upserts).toHaveLength(0);
    const warn = logs.find((l) => l.level === 'warn')!;
    expect(warn.msg).toBe('ci install failed');
    expect(warn.obj).toMatchObject({ code, status });
  });

  it('maps a failure while resolving the default branch the same way', async () => {
    const { service } = build({ github: failingGithub(404, 'branch') });
    await expect(service.install(WS, AGENT_ID, request())).rejects.toMatchObject({ code: 'repo_not_accessible' });
  });

  it('maps a missing token (config_error from the container) to 409 token_missing', async () => {
    const broken = new CiExportService({
      repo: new FakeCiRepo(),
      agents: { getById: async () => agentRow(), linkedSkills: async () => [] },
      github: async () => {
        throw new AppError('config_error', 'GITHUB_TOKEN is not set', 500);
      },
      readRunnerBundle: async () => RUNNER,
      log: { info: () => {}, warn: () => {} },
    });
    await expect(broken.install(WS, AGENT_ID, request())).rejects.toMatchObject({ code: 'token_missing', statusCode: 409 });
  });
});

describe('CiExportService.zip', () => {
  it('returns the bundle as a zip without any GitHub call and records a pending installation with no PR url', async () => {
    const { service, githubFactory, github, repo } = build({ skills: [{ name: 'API Gate' }] });
    const out = await service.zip(WS, AGENT_ID, request());

    expect(out.filename).toBe('devdigest-ci-general-reviewer.zip');
    const files = unzipSync(out.bytes);
    expect(Object.keys(files).sort()).toEqual([
      '.devdigest/agents/general-reviewer.yaml',
      '.devdigest/memory.jsonl',
      '.devdigest/runner/index.mjs',
      '.devdigest/skills/api-gate.md',
      '.github/workflows/devdigest-review.yml',
    ]);
    expect(strFromU8(files['.devdigest/runner/index.mjs']!)).toBe(RUNNER);
    expect(strFromU8(files['.devdigest/skills/api-gate.md']!)).toBe('body of API Gate');
    expect(strFromU8(files['.github/workflows/devdigest-review.yml']!)).toContain('pull_request');

    expect(githubFactory).not.toHaveBeenCalled();
    expect(github.committed).toHaveLength(0);
    expect(repo.upserts).toEqual([
      { agentId: AGENT_ID, repo: 'acme/widgets', manifestVersion: 3, workflowVersion: 1, prUrl: null, status: 'pending' },
    ]);
  });

  it('rejects an invalid workflow and records nothing', async () => {
    const { service, repo } = build();
    const err = await rejection(() => service.zip(WS, AGENT_ID, request({ workflow: 'on: workflow_run\njobs: {}\n' })));
    expect(err.code).toBe('workflow_invalid');
    expect(repo.upserts).toHaveLength(0);
  });
});

describe('CiExportService.listInstallations', () => {
  it('maps rows to DTOs and 404s for an unknown agent', async () => {
    const { service, repo } = build();
    repo.rows = [
      {
        repoId: REPO_ID,
        row: {
          id: 'i-9',
          agentId: AGENT_ID,
          repo: 'acme/widgets',
          targetType: 'gha',
          installedAt: new Date('2026-10-14T09:00:00Z'),
          manifestVersion: 2,
          workflowVersion: 1,
          prUrl: null,
          status: 'active',
        },
      },
    ];
    const out = await service.listInstallations(WS, AGENT_ID);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'i-9', repo_id: REPO_ID, status: 'active', manifest_version: 2, pr_url: null });

    await expect(service.listInstallations(WS, 'other-agent')).rejects.toBeInstanceOf(NotFoundError);
  });
});
