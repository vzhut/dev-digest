import type { CiSyncResult, GitHubClient, RepoRef } from '@devdigest/shared';
import type { CiLogger } from './service.js';
import type { CiRepository, WorkspaceInstallation } from './repository.js';
import { CI_ARTIFACT_NAME, CI_MAX_ARTIFACT_BYTES, CI_SYNC_PER_PAGE, CI_WORKFLOW_FILE } from './constants.js';
import {
  ciRunKey,
  isCompleted,
  parseArtifactZip,
  runPathRejection,
  toCiRunItem,
  toCiRunRecord,
  verifyArtifact,
  type RejectReason,
} from './ingest.js';

/** The repository methods the ingest service uses (keeps fakes honest in tests). */
export type CiIngestRepo = Pick<
  CiRepository,
  'hasCiRunKey' | 'insertCiRun' | 'listCiRuns' | 'listWorkspaceInstallations' | 'markInstallationActive'
>;

export interface CiIngestDeps {
  repo: CiIngestRepo;
  github: () => Promise<GitHubClient>;
  log: CiLogger;
}

interface Counters {
  accepted: number;
  duplicates: number;
  rejected: number;
}

/**
 * Pull-model ingest: ask GitHub for the recent runs of the devdigest workflow in
 * every installed repo, verify each result artifact against the run, store it.
 * There is no inbound endpoint. Logs carry counts and reasons only, never tokens
 * or artifact contents.
 */
export class CiIngestService {
  private locks = new Map<string, Promise<unknown>>();

  constructor(private deps: CiIngestDeps) {}

  /** Syncs of one workspace run one after another (in-process lock). */
  async sync(workspaceId: string): Promise<CiSyncResult> {
    const previous = this.locks.get(workspaceId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(() => this.doSync(workspaceId));
    this.locks.set(workspaceId, current);
    try {
      return await current;
    } finally {
      if (this.locks.get(workspaceId) === current) this.locks.delete(workspaceId);
    }
  }

  async list(workspaceId: string): Promise<CiSyncResult['runs']> {
    const rows = await this.deps.repo.listCiRuns(workspaceId);
    return rows.flatMap((r) => toCiRunItem(r) ?? []);
  }

  private async doSync(workspaceId: string): Promise<CiSyncResult> {
    const counters: Counters = { accepted: 0, duplicates: 0, rejected: 0 };
    const installations = await this.deps.repo.listWorkspaceInstallations(workspaceId);
    if (installations.length > 0) {
      const github = await this.deps.github();
      for (const inst of installations) {
        try {
          await this.syncInstallation(github, workspaceId, inst, counters);
        } catch (err) {
          this.deps.log.warn(
            { repo: inst.repo, status: (err as { status?: unknown })?.status },
            'ci sync failed for installation',
          );
        }
      }
    }
    this.deps.log.info({ ...counters }, 'ci sync done');
    return { runs: await this.list(workspaceId), ...counters };
  }

  private async syncInstallation(
    github: GitHubClient,
    workspaceId: string,
    inst: WorkspaceInstallation,
    counters: Counters,
  ): Promise<void> {
    const [owner, name] = inst.repo.split('/');
    if (!owner || !name) return;
    const ref: RepoRef = { owner, name };
    const runs = await github.listWorkflowRuns(ref, CI_WORKFLOW_FILE, { perPage: CI_SYNC_PER_PAGE });
    let stored = false;

    for (const run of runs) {
      if (!isCompleted(run)) continue;
      const key = ciRunKey(run);
      if (await this.deps.repo.hasCiRunKey(workspaceId, key)) {
        counters.duplicates += 1;
        continue;
      }
      const pathReason = runPathRejection(run);
      if (pathReason) {
        this.reject(counters, inst.repo, key, pathReason);
        continue;
      }

      let artifact = null;
      try {
        const refs = await github.listRunArtifacts(ref, run.id);
        const found = refs.find((a) => a.name === CI_ARTIFACT_NAME && !a.expired);
        if (found) {
          if (found.size_in_bytes > CI_MAX_ARTIFACT_BYTES) {
            this.reject(counters, inst.repo, key, 'artifact_too_large');
            continue;
          }
          const parsed = parseArtifactZip(await github.downloadArtifact(ref, found.id));
          if (!parsed.ok) {
            this.reject(counters, inst.repo, key, parsed.reason);
            continue;
          }
          const mismatch = verifyArtifact(parsed.artifact, run);
          if (mismatch) {
            this.reject(counters, inst.repo, key, mismatch);
            continue;
          }
          artifact = parsed.artifact;
        }
      } catch (err) {
        this.deps.log.warn(
          { repo: inst.repo, key, status: (err as { status?: unknown })?.status },
          'ci artifact fetch failed',
        );
        continue;
      }

      await this.deps.repo.insertCiRun(
        toCiRunRecord(
          { workspaceId, agentId: inst.agentId, agentName: inst.agentName, repo: inst.repo },
          run,
          artifact,
        ),
      );
      counters.accepted += 1;
      stored = true;
    }
    if (stored) await this.deps.repo.markInstallationActive(inst.id);
  }

  private reject(counters: Counters, repo: string, key: string, reason: RejectReason): void {
    counters.rejected += 1;
    this.deps.log.warn({ repo, key, reason }, 'ci run rejected');
  }
}
