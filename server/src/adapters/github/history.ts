import { Octokit } from 'octokit';
import type { RepoRef } from '@devdigest/shared';
import { withRetry, withTimeout } from '../../platform/resilience.js';
import { ExternalServiceError } from '../../platform/errors.js';

const TIMEOUT = 30_000;

/** A merged PR whose commits touched one or more of the requested paths. */
export interface PriorPr {
  number: number;
  title: string;
  mergedAt: string;
  author: string;
  /** The subset of the requested paths whose commits associate with this PR. */
  filesOverlap: string[];
}

export interface MergedPrsTouchingOptions {
  /** Only the first N of the given paths are queried. */
  maxPaths: number;
  /** `per_page` for `repos.listCommits({path})`. */
  commitsPerPath: number;
  /** Distinct commits are capped here before resolving their PRs. */
  maxCommits: number;
}

/**
 * Port: merged PRs whose commits touched any of the given paths
 * (Design "Prior PRs", `specs/blast-radius.tasks.md`, OD5).
 */
export interface GitHubHistory {
  mergedPrsTouching(
    repo: RepoRef,
    paths: string[],
    opts: MergedPrsTouchingOptions,
  ): Promise<PriorPr[]>;
}

/**
 * Octokit implementation. Calls `repos.listCommits({path})` once per changed path
 * (capped at `maxPaths`), then `repos.listPullRequestsAssociatedWithCommit` once per
 * distinct commit (capped at `maxCommits`) — at most `maxPaths + maxCommits` GitHub
 * calls total. Only PRs with `merged_at != null` are kept.
 *
 * Commit→PR association for squash merges is GitHub's own heuristic and is
 * Unverified here — this adapter does not attempt to correct it.
 */
export class OctokitGitHubHistory implements GitHubHistory {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async mergedPrsTouching(
    repo: RepoRef,
    paths: string[],
    opts: MergedPrsTouchingOptions,
  ): Promise<PriorPr[]> {
    try {
      // sha -> set of requested paths whose commit history included it.
      const commitPaths = new Map<string, Set<string>>();
      for (const path of paths.slice(0, opts.maxPaths)) {
        const shas = await this.listCommitShas(repo, path, opts.commitsPerPath);
        for (const sha of shas) {
          if (!commitPaths.has(sha)) {
            if (commitPaths.size >= opts.maxCommits) continue;
            commitPaths.set(sha, new Set());
          }
          commitPaths.get(sha)!.add(path);
        }
      }

      const byNumber = new Map<number, PriorPr>();
      for (const [sha, touchedPaths] of commitPaths) {
        const prs = await this.listMergedPrsForCommit(repo, sha);
        for (const pr of prs) {
          const existing = byNumber.get(pr.number);
          if (existing) {
            for (const p of touchedPaths) {
              if (!existing.filesOverlap.includes(p)) existing.filesOverlap.push(p);
            }
          } else {
            byNumber.set(pr.number, { ...pr, filesOverlap: [...touchedPaths] });
          }
        }
      }
      return [...byNumber.values()];
    } catch (err) {
      // Never include the token; Octokit error messages don't carry it, but be
      // deliberate rather than forwarding an unknown SDK error shape verbatim.
      throw new ExternalServiceError('GitHub history lookup failed', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async listCommitShas(repo: RepoRef, path: string, perPage: number): Promise<string[]> {
    const res = await withRetry(() =>
      withTimeout(
        this.octokit.rest.repos.listCommits({
          owner: repo.owner,
          repo: repo.name,
          path,
          per_page: perPage,
        }),
        TIMEOUT,
      ),
    );
    return res.data.map((c) => c.sha);
  }

  private async listMergedPrsForCommit(
    repo: RepoRef,
    sha: string,
  ): Promise<Array<Omit<PriorPr, 'filesOverlap'>>> {
    const res = await withRetry(() =>
      withTimeout(
        this.octokit.rest.repos.listPullRequestsAssociatedWithCommit({
          owner: repo.owner,
          repo: repo.name,
          commit_sha: sha,
        }),
        TIMEOUT,
      ),
    );
    return res.data
      .filter((pr) => pr.merged_at != null)
      .map((pr) => ({
        number: pr.number,
        title: pr.title,
        mergedAt: pr.merged_at as string,
        author: pr.user?.login ?? 'unknown',
      }));
  }
}
