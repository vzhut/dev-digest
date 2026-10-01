import type { PrHistory } from '@devdigest/shared';
import { ConfigError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import type { GitHubHistory } from '../../adapters/github/history.js';
import type { BlastRepository } from './repository.js';
import { toPrHistory } from './helpers.js';
import {
  HISTORY_CACHE_MAX_ENTRIES,
  HISTORY_CACHE_TTL_MS,
  HISTORY_COMMITS_PER_PATH,
  HISTORY_LOG_EVENT,
  HISTORY_MAX_COMMITS,
  HISTORY_MAX_PATHS,
} from './constants.js';

/** Narrow dependencies (no `Container` locator). */
export interface PrHistoryServiceDeps {
  repo: Pick<BlastRepository, 'findPullContext'>;
  /** Lazily resolves the port; throws `ConfigError` when no GitHub token is configured. */
  history: () => Promise<GitHubHistory>;
  /** Injected clock, for a deterministic TTL in tests. */
  now: () => Date;
  log: { info: (obj: unknown, msg?: string) => void };
}

interface CacheEntry {
  at: number;
  value: PrHistory;
}

/**
 * Prior-PRs use case (Design "Prior PRs", `specs/blast-radius.tasks.md`, OD5): GitHub
 * commits-per-path → associated merged PRs, mapped to `PrHistory`. An in-process TTL
 * cache keyed `repoId:headSha` (no DB table) avoids re-hitting GitHub on every
 * Overview-tab load. Only a fully successful (non-degraded) lookup is cached — a
 * missing token or a GitHub failure is re-tried on the next call.
 */
export class PrHistoryService {
  private cache = new Map<string, CacheEntry>();

  constructor(private deps: PrHistoryServiceDeps) {}

  async getHistory(workspaceId: string, prId: string): Promise<PrHistory> {
    const ctx = await this.deps.repo.findPullContext(workspaceId, prId);
    if (!ctx) throw new NotFoundError('Pull request not found');

    const key = `${ctx.repoId}:${ctx.headSha}`;
    const now = this.deps.now().getTime();
    const cached = this.cache.get(key);
    if (cached && now - cached.at < HISTORY_CACHE_TTL_MS) {
      this.deps.log.info({ event: HISTORY_LOG_EVENT, prId, source: 'cache' }, 'blast: prior-pr history (cached)');
      return cached.value;
    }

    let github: GitHubHistory;
    try {
      github = await this.deps.history();
    } catch (err) {
      if (err instanceof ConfigError) {
        this.deps.log.info(
          { event: HISTORY_LOG_EVENT, prId, source: 'github', reason: 'no_github_token' },
          'blast: prior-pr history degraded (no token)',
        );
        return { history: [], degraded: true, reason: 'no_github_token' };
      }
      throw err;
    }

    const [owner = '', name = ''] = ctx.repoFullName.split('/');
    let items;
    try {
      items = await github.mergedPrsTouching({ owner, name }, ctx.files, {
        maxPaths: HISTORY_MAX_PATHS,
        commitsPerPath: HISTORY_COMMITS_PER_PATH,
        maxCommits: HISTORY_MAX_COMMITS,
      });
    } catch (err) {
      if (err instanceof ExternalServiceError) {
        this.deps.log.info(
          { event: HISTORY_LOG_EVENT, prId, source: 'github', reason: 'github_error' },
          'blast: prior-pr history degraded (GitHub error)',
        );
        return { history: [], degraded: true, reason: 'github_error' };
      }
      throw err;
    }

    const result = toPrHistory(items, ctx.number, ctx.files);
    this.setCache(key, result, now);
    this.deps.log.info(
      { event: HISTORY_LOG_EVENT, prId, source: 'github', items: result.history.length },
      'blast: prior-pr history fetched',
    );
    return result;
  }

  private setCache(key: string, value: PrHistory, at: number): void {
    if (!this.cache.has(key) && this.cache.size >= HISTORY_CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { at, value });
  }
}
