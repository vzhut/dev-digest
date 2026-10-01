import type { BlastRadius } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { RepoIntel } from '../repo-intel/types.js';
import type { BlastRepository } from './repository.js';
import { toBlastRadius } from './helpers.js';
import { BLAST_LOG_EVENT, BLAST_LOG_MSG_FALLBACK, BLAST_LOG_MSG_INDEX } from './constants.js';

/** Narrow dependencies (no `Container` locator). No LLM dependency by design (spec D5). */
export interface BlastServiceDeps {
  repo: Pick<BlastRepository, 'findPullContext'>;
  repoIntel: Pick<RepoIntel, 'getBlastRadius' | 'getIndexState'>;
  log: { info: (obj: unknown, msg?: string) => void };
}

/**
 * Blast radius use case: READ the ready repo-intel index once and map it to the wire
 * contract. It never indexes, re-parses or calls a model.
 */
export class BlastService {
  constructor(private deps: BlastServiceDeps) {}

  async getBlast(workspaceId: string, prId: string): Promise<BlastRadius> {
    const startedAt = Date.now();
    const ctx = await this.deps.repo.findPullContext(workspaceId, prId);
    if (!ctx) throw new NotFoundError('Pull request not found');

    const state = await this.deps.repoIntel.getIndexState(ctx.repoId);
    const result = await this.deps.repoIntel.getBlastRadius(ctx.repoId, ctx.files);
    const blast = toBlastRadius(result, state);

    const source = result.degraded === true ? 'fallback' : 'index';
    this.deps.log.info(
      {
        event: BLAST_LOG_EVENT,
        prId,
        repoId: ctx.repoId,
        files: ctx.files.length,
        source,
        indexStatus: state.status,
        indexedSha: blast.indexed_sha ?? null,
        degraded: blast.degraded ?? false,
        reason: blast.reason ?? null,
        symbols: blast.stats?.symbols_changed ?? 0,
        callers: blast.stats?.callers ?? 0,
        endpoints: blast.stats?.endpoints ?? 0,
        crons: blast.stats?.crons ?? 0,
        ms: Date.now() - startedAt,
      },
      source === 'index' ? BLAST_LOG_MSG_INDEX : BLAST_LOG_MSG_FALLBACK,
    );
    return blast;
  }
}
