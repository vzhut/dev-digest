import { strToU8, zipSync } from 'fflate';
import type {
  CiExportRequest,
  CiFile,
  CiInstallation,
  CiInstallResult,
  CiPreview,
  CiWorkflowViolation,
  GitHubClient,
  RepoRef,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { AgentRow, RepoRow, SkillRow } from '../../db/rows.js';
import type { CiRepository } from './repository.js';
import {
  CI_BRANCH,
  CI_COMMIT_MESSAGE,
  CI_PR_TITLE,
  CI_WORKFLOW_VERSION,
  CI_ZIP_FILENAME_PREFIX,
} from './constants.js';
import {
  buildFiles,
  buildManifest,
  exportSkills,
  githubFailure,
  githubStatusOf,
  githubDebugOf,
  isExportable,
  otherAgentWarning,
  runnerPlaceholder,
  slugify,
  toInstallationDto,
} from './helpers.js';
import { renderWorkflow, validateWorkflow } from './workflow.js';

/** The two agent reads this module needs (`container.agentsRepo` satisfies it). */
export interface CiAgentsPort {
  getById(workspaceId: string, id: string): Promise<AgentRow | undefined>;
  linkedSkills(
    agentId: string,
  ): Promise<{ skill: SkillRow; order: number; enabled: boolean }[]>;
}

export interface CiLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

/** The repository methods the export service uses (keeps fakes honest in tests). */
export type CiExportRepo = Pick<
  CiRepository,
  'getRepoForWorkspace' | 'upsertInstallation' | 'otherAgentInstalled' | 'listInstallations'
>;

export interface CiExportDeps {
  repo: CiExportRepo;
  agents: CiAgentsPort;
  github: () => Promise<GitHubClient>;
  /** The bundled runner source, or null when it has not been built. */
  readRunnerBundle: () => Promise<string | null>;
  log: CiLogger;
}

export interface ZipResult {
  filename: string;
  bytes: Uint8Array;
}

interface Prepared {
  agent: AgentRow;
  repo: RepoRow;
  slug: string;
  runner: string;
  workflow: string;
  violations: CiWorkflowViolation[];
  buildAll: (runner: string) => CiFile[];
}

export class CiExportService {
  constructor(private deps: CiExportDeps) {}

  async preview(workspaceId: string, agentId: string, req: CiExportRequest): Promise<CiPreview> {
    const p = await this.prepare(workspaceId, agentId, req);
    const other = await this.deps.repo.otherAgentInstalled(workspaceId, p.repo.fullName, p.agent.id);
    return {
      files: p.buildAll(runnerPlaceholder(Buffer.byteLength(p.runner))),
      workflow_violations: p.violations,
      warnings: other ? [otherAgentWarning(other)] : [],
    };
  }

  async install(workspaceId: string, agentId: string, req: CiExportRequest): Promise<CiInstallResult> {
    const p = await this.prepare(workspaceId, agentId, req);
    this.assertValid(p.violations);
    const ref: RepoRef = { owner: p.repo.owner, name: p.repo.name };

    let prUrl: string;
    let base: string;
    try {
      const github = await this.deps.github();
      // The stored default_branch is never synced from GitHub, so ask GitHub.
      base = await github.getDefaultBranch(ref);
      await github.commitFiles(ref, {
        branch: CI_BRANCH,
        base,
        message: CI_COMMIT_MESSAGE,
        files: p.buildAll(p.runner).map((f) => ({ path: f.path, contents: f.contents })),
      });
      const existing = await github.findOpenPr(ref, CI_BRANCH);
      prUrl = (
        existing ??
        (await github.openPullRequest(ref, {
          title: CI_PR_TITLE,
          head: CI_BRANCH,
          base,
          body: prBody(p.agent.name),
        }))
      ).url;
    } catch (err) {
      const failure = err instanceof AppError && err.code === 'config_error'
        ? new AppError('token_missing', 'The GitHub token is missing or invalid.', 409)
        : githubFailure(err);
      this.deps.log.warn(
        { agentId, repo: p.repo.fullName, code: failure.code, status: githubStatusOf(err), ...githubDebugOf(err) },
        'ci install failed',
      );
      throw failure;
    }

    const row = await this.deps.repo.upsertInstallation({
      agentId: p.agent.id,
      repo: p.repo.fullName,
      manifestVersion: p.agent.version,
      workflowVersion: CI_WORKFLOW_VERSION,
      prUrl,
      status: 'pending',
    });
    this.deps.log.info(
      { agentId, repo: p.repo.fullName, target: 'github_actions', branch: CI_BRANCH, base, outcome: 'pr_ready', pr_url: prUrl },
      'ci install pr ready',
    );
    return { installation: toInstallationDto(row, p.repo.id), pr_url: prUrl };
  }

  /** Zip of the export bundle; records a `pending` installation, makes no GitHub call. */
  async zip(workspaceId: string, agentId: string, req: CiExportRequest): Promise<ZipResult> {
    const p = await this.prepare(workspaceId, agentId, req);
    this.assertValid(p.violations);
    const entries: Record<string, Uint8Array> = {};
    for (const f of p.buildAll(p.runner)) entries[f.path] = strToU8(f.contents);
    const bytes = zipSync(entries);
    await this.deps.repo.upsertInstallation({
      agentId: p.agent.id,
      repo: p.repo.fullName,
      manifestVersion: p.agent.version,
      workflowVersion: CI_WORKFLOW_VERSION,
      prUrl: null,
      status: 'pending',
    });
    this.deps.log.info(
      { agentId, repo: p.repo.fullName, target: 'github_actions', outcome: 'zip', files: Object.keys(entries).length },
      'ci zip exported',
    );
    return { filename: `${CI_ZIP_FILENAME_PREFIX}${p.slug}.zip`, bytes };
  }

  async listInstallations(workspaceId: string, agentId: string): Promise<CiInstallation[]> {
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const rows = await this.deps.repo.listInstallations(workspaceId, agentId);
    return rows.map((r) => toInstallationDto(r.row, r.repoId));
  }

  private assertValid(violations: CiWorkflowViolation[]): void {
    if (violations.length > 0) {
      throw new AppError('workflow_invalid', 'The workflow breaks the CI safety rules.', 422, {
        violations,
      });
    }
  }

  private async prepare(workspaceId: string, agentId: string, req: CiExportRequest): Promise<Prepared> {
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    if (!isExportable(agent)) {
      throw new AppError(
        'agent_not_exportable',
        'Only OpenRouter agents can run in CI.',
        422,
        { provider: agent.provider },
      );
    }
    const repo = await this.deps.repo.getRepoForWorkspace(workspaceId, req.repo_id);
    if (!repo) throw new AppError('no_repository', 'Repository is not connected to this workspace.', 404);

    const runner = await this.deps.readRunnerBundle();
    if (runner === null) {
      throw new AppError(
        'runner_bundle_missing',
        'The agent-runner bundle is not built. Run "cd agent-runner && pnpm install && pnpm build".',
        409,
      );
    }

    const skills = exportSkills(await this.deps.agents.linkedSkills(agent.id));
    const manifest = buildManifest(agent, skills, req.post_as);
    const slug = slugify(agent.name);
    const workflow = req.workflow ?? renderWorkflow({ triggers: req.triggers, postAs: req.post_as });
    return {
      agent,
      repo,
      slug,
      runner,
      workflow,
      violations: validateWorkflow(workflow),
      buildAll: (r) => buildFiles({ slug, manifest, skills, runner: r, workflow }),
    };
  }
}

function prBody(agentName: string): string {
  return [
    `Adds the DevDigest review agent "${agentName}" as a GitHub Actions check.`,
    '',
    'After merging, add the repository secret `OPENROUTER_API_KEY`. The check runs on pull requests from this repository only.',
  ].join('\n');
}
