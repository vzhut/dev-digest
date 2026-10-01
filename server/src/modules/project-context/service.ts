import type {
  AgentContext,
  ContextDocContent,
  ContextDocWritten,
  ContextListing,
  SkillContext,
} from '@devdigest/shared';
import type { ProjectDocs } from '../../adapters/project-docs/index.js';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import { NotFoundError } from '../../platform/errors.js';
import { countUsedByAgents, effectiveRoots } from '../_shared/project-context.js';
import { matchesAnyRoot, toContextDoc } from './helpers.js';
import type { ProjectContextRepository, RepoContextRow } from './repository.js';

export interface ProjectContextDeps {
  repo: ProjectContextRepository;
  docs: ProjectDocs;
  tokenizer: Tokenizer;
  now: () => Date;
  /** Structured logger (info only); never receives document text. */
  log: { info: (msg: string) => void };
}

export class ProjectContextService {
  constructor(private deps: ProjectContextDeps) {}

  private async requireRepo(workspaceId: string, repoId: string): Promise<RepoContextRow> {
    const repo = await this.deps.repo.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  /** Fresh scan on every call; no caching. */
  async list(workspaceId: string, repoId: string): Promise<ContextListing> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const roots = effectiveRoots(repo.contextRoots);
    const scannedAt = this.deps.now().toISOString();

    if (!repo.clonePath || !(await this.deps.docs.exists(repo.clonePath))) {
      return { roots, status: 'not_cloned', scanned_at: scannedAt, total_tokens: 0, files: [] };
    }

    const [stats, usedByInputs] = await Promise.all([
      this.deps.docs.list(repo.clonePath, roots),
      this.deps.repo.usedByInputs(workspaceId),
    ]);
    const usedBy = countUsedByAgents(usedByInputs.agents, usedByInputs.skills, usedByInputs.links);
    const files = stats
      .map((s) => toContextDoc(s, this.deps.tokenizer, usedBy))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const totalTokens = files.reduce((sum, f) => sum + f.tokens, 0);
    return { roots, status: 'ok', scanned_at: scannedAt, total_tokens: totalTokens, files };
  }

  /** One document's text. 404 when absent, unreadable, or outside the repo's search roots. */
  async readFile(workspaceId: string, repoId: string, path: string): Promise<ContextDocContent> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath || !matchesAnyRoot(path, effectiveRoots(repo.contextRoots))) {
      throw new NotFoundError('Document not found');
    }
    const result = await this.deps.docs.read(repo.clonePath, path);
    if (result.status !== 'ok') throw new NotFoundError('Document not found');
    return { path, content: result.text };
  }

  /**
   * Replace an existing discovered document in the LOCAL clone only (no commit/push).
   * 404 when it is not a discovered doc (outside roots, absent, symlink, .git/node_modules,
   * outside the clone) or the repo has no clone.
   */
  async writeFile(
    workspaceId: string,
    repoId: string,
    path: string,
    content: string,
  ): Promise<ContextDocWritten> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath || !(await this.deps.docs.exists(repo.clonePath))) {
      throw new NotFoundError('Repo is not cloned');
    }
    const segments = path.split('/');
    if (
      !matchesAnyRoot(path, effectiveRoots(repo.contextRoots)) ||
      segments.some((s) => ['.git', 'node_modules'].includes(s.toLowerCase()))
    ) {
      throw new NotFoundError('Document not found');
    }
    const result = await this.deps.docs.write(repo.clonePath, path, content);
    if (result.status !== 'ok') throw new NotFoundError('Document not found');
    this.deps.log.info(`project context: wrote ${path} (${result.sizeBytes} bytes)`);
    return {
      path,
      content,
      size_bytes: result.sizeBytes,
      tokens: this.deps.tokenizer.count(content),
    };
  }

  async getRoots(workspaceId: string, repoId: string): Promise<{ roots: string[] }> {
    const repo = await this.requireRepo(workspaceId, repoId);
    return { roots: effectiveRoots(repo.contextRoots) };
  }

  /** `[]` resets to the default glob (stored as NULL). */
  async setRoots(workspaceId: string, repoId: string, roots: string[]): Promise<{ roots: string[] }> {
    await this.requireRepo(workspaceId, repoId);
    await this.deps.repo.setRoots(workspaceId, repoId, roots.length > 0 ? roots : null);
    return { roots: effectiveRoots(roots) };
  }

  async getAgentContext(workspaceId: string, agentId: string): Promise<AgentContext> {
    const paths = await this.deps.repo.findAgentPaths(workspaceId, agentId);
    if (!paths) throw new NotFoundError('Agent not found');
    const inherited = await this.deps.repo.inheritedSkills(workspaceId, agentId);
    return {
      paths,
      inherited: inherited.map((s) => ({
        skill_id: s.skillId,
        skill_name: s.skillName,
        paths: s.contextPaths,
      })),
    };
  }

  async setAgentContext(workspaceId: string, agentId: string, paths: string[]): Promise<AgentContext> {
    if (!(await this.deps.repo.findAgentPaths(workspaceId, agentId))) {
      throw new NotFoundError('Agent not found');
    }
    await this.deps.repo.setAgentPaths(workspaceId, agentId, paths);
    return this.getAgentContext(workspaceId, agentId);
  }

  async getSkillContext(workspaceId: string, skillId: string): Promise<SkillContext> {
    const paths = await this.deps.repo.findSkillPaths(workspaceId, skillId);
    if (!paths) throw new NotFoundError('Skill not found');
    return { paths };
  }

  async setSkillContext(workspaceId: string, skillId: string, paths: string[]): Promise<SkillContext> {
    if (!(await this.deps.repo.findSkillPaths(workspaceId, skillId))) {
      throw new NotFoundError('Skill not found');
    }
    await this.deps.repo.setSkillPaths(workspaceId, skillId, paths);
    return { paths };
  }
}
