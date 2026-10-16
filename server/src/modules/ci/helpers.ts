import { stringify } from 'yaml';
import {
  AgentManifest,
  type CiFailOn,
  type CiFile,
  type CiInstallation,
  type CiPostAs,
  type Provider,
  type ReviewStrategy,
} from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import type { AgentRow, CiInstallationRow, SkillRow } from '../../db/rows.js';
import {
  CI_AGENTS_DIR,
  CI_EXPORTABLE_PROVIDER,
  CI_MEMORY_PATH,
  CI_RUNNER_PATH,
  CI_SKILLS_DIR,
  CI_WORKFLOW_PATH,
  CI_WORKFLOW_VERSION,
} from './constants.js';

/** Pure helpers for the ci module: slugs, manifest, file list, DTO, GitHub error mapping. */

const MAX_SLUG = 64;

/** Lowercase kebab slug, `[a-z0-9-]` only (safe as a path segment). */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, '');
  return slug || 'agent';
}

export function isExportable(agent: Pick<AgentRow, 'provider'>): boolean {
  return agent.provider === CI_EXPORTABLE_PROVIDER;
}

export interface LinkedSkill {
  skill: Pick<SkillRow, 'name' | 'body' | 'version'>;
  enabled: boolean;
}

export interface ExportSkill {
  slug: string;
  body: string;
  version: number;
}

/** Enabled linked skills in order, with unique slugs (`-2`, `-3` on collisions). */
export function exportSkills(linked: readonly LinkedSkill[]): ExportSkill[] {
  const seen = new Map<string, number>();
  const out: ExportSkill[] = [];
  for (const l of linked) {
    if (!l.enabled) continue;
    const base = slugify(l.skill.name);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.push({
      slug: n === 1 ? base : `${base}-${n}`,
      body: l.skill.body,
      version: l.skill.version,
    });
  }
  return out;
}

/** The manifest the runner reads; validated by the shared schema both ends use. */
export function buildManifest(
  agent: Pick<AgentRow, 'name' | 'provider' | 'model' | 'systemPrompt' | 'strategy' | 'ciFailOn' | 'version'>,
  skills: readonly ExportSkill[],
  postAs: CiPostAs,
): AgentManifest {
  return AgentManifest.parse({
    name: agent.name,
    provider: agent.provider as Provider,
    model: agent.model,
    system_prompt: agent.systemPrompt,
    skills: skills.map((s) => s.slug),
    strategy: agent.strategy as ReviewStrategy,
    ci_fail_on: agent.ciFailOn as CiFailOn,
    version: agent.version,
    skill_versions: Object.fromEntries(skills.map((s) => [s.slug, s.version])),
    post_as: postAs,
  });
}

export function manifestYaml(manifest: AgentManifest): string {
  return stringify(manifest);
}

export interface BuildFilesInput {
  slug: string;
  manifest: AgentManifest;
  skills: readonly ExportSkill[];
  runner: string;
  workflow: string;
}

/**
 * The export bundle in display order: manifest, skills, memory, runner, workflow.
 * Only the workflow is editable in the wizard; the rest is generated from the agent.
 */
export function buildFiles(input: BuildFilesInput): CiFile[] {
  return [
    { path: `${CI_AGENTS_DIR}/${input.slug}.yaml`, contents: manifestYaml(input.manifest), editable: false },
    ...input.skills.map((s) => ({
      path: `${CI_SKILLS_DIR}/${s.slug}.md`,
      contents: s.body,
      editable: false,
    })),
    { path: CI_MEMORY_PATH, contents: '', editable: false },
    { path: CI_RUNNER_PATH, contents: input.runner, editable: false },
    { path: CI_WORKFLOW_PATH, contents: input.workflow, editable: true },
  ];
}

/** Preview stand-in for the (large, minified) runner bundle. */
export function runnerPlaceholder(bytes: number): string {
  return `// bundled agent-runner, ${bytes} bytes`;
}

export function toInstallationDto(row: CiInstallationRow, repoId: string | null): CiInstallation {
  return {
    id: row.id,
    agent_id: row.agentId,
    repo: row.repo,
    repo_id: repoId,
    target_type: row.targetType,
    installed_at: row.installedAt.toISOString(),
    manifest_version: row.manifestVersion,
    workflow_version: row.workflowVersion,
    current_workflow_version: CI_WORKFLOW_VERSION,
    pr_url: row.prUrl,
    status: row.status,
  };
}

export function otherAgentWarning(otherAgentName: string): string {
  return `Agent "${otherAgentName}" is already installed in this repository. The runner accepts exactly one agent manifest, so delete its .devdigest/agents/*.yaml file in the install PR.`;
}

const TOKEN_PERMISSION_MESSAGE =
  'The GitHub token cannot write to this repository. It needs Contents, Pull requests and Workflows write access.';

/** HTTP status carried by an Octokit error or an `ExternalServiceError.details`. */
export function githubStatusOf(err: unknown): number | null {
  const direct = (err as { status?: unknown })?.status;
  if (typeof direct === 'number') return direct;
  const viaDetails = (err as { details?: { status?: unknown } })?.details?.status;
  return typeof viaDetails === 'number' ? viaDetails : null;
}

/**
 * Safe debugging facts about a failed GitHub call for the server log: which
 * endpoint answered and what GitHub said. Never the headers (they carry the
 * token) and never the query string.
 */
export function githubDebugOf(err: unknown): { method?: string; path?: string; github_message?: string } {
  const e = err as {
    request?: { method?: unknown; url?: unknown };
    response?: { data?: { message?: unknown } };
  };
  const out: { method?: string; path?: string; github_message?: string } = {};
  if (typeof e?.request?.method === 'string') out.method = e.request.method;
  if (typeof e?.request?.url === 'string') {
    try {
      out.path = new URL(e.request.url).pathname;
    } catch {
      /* not a URL: leave it out */
    }
  }
  const msg = e?.response?.data?.message;
  if (typeof msg === 'string') out.github_message = msg.slice(0, 200);
  return out;
}

/**
 * Map a failed GitHub call to a typed `AppError`: 401 token_missing,
 * 403 token_permission_missing, 404 repo_not_accessible (a fine-grained PAT
 * answers 404 for repos it cannot see), anything else github_unavailable.
 * Never copies the SDK message (it can embed request URLs).
 */
export function githubFailure(err: unknown): AppError {
  switch (githubStatusOf(err)) {
    case 401:
      return new AppError('token_missing', 'The GitHub token is missing or invalid.', 409);
    case 403:
      return new AppError('token_permission_missing', TOKEN_PERMISSION_MESSAGE, 409);
    case 404:
      return new AppError(
        'repo_not_accessible',
        'The repository was not found or the GitHub token cannot access it.',
        404,
      );
    default:
      return new AppError('github_unavailable', 'GitHub is unavailable. Try again later.', 502);
  }
}
