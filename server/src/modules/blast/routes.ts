import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadius, PrHistory } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastRepository } from './repository.js';
import { BlastService } from './service.js';
import { PrHistoryService } from './history-service.js';

/**
 * blast module (specs/blast-radius.md).
 *   GET /pulls/:id/blast    → BlastRadius (read from the repo-intel index; degraded/reason passed through)
 *   GET /pulls/:id/history  → PrHistory (GitHub commits→PRs touching the same files; TTL-cached, OD5)
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const repo = new BlastRepository(container.db);
  const service = new BlastService({
    repo,
    repoIntel: container.repoIntel,
    log: app.log,
  });
  const historyService = new PrHistoryService({
    repo,
    history: () => container.githubHistory(),
    now: () => new Date(),
    log: app.log,
  });

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastRadius } } },
    async (req): Promise<BlastRadius> => {
      const { workspaceId } = await getContext(container, req);
      return service.getBlast(workspaceId, req.params.id);
    },
  );

  app.get(
    '/pulls/:id/history',
    {
      schema: { params: IdParams, response: { 200: PrHistory } },
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (req): Promise<PrHistory> => {
      const { workspaceId } = await getContext(container, req);
      return historyService.getHistory(workspaceId, req.params.id);
    },
  );
}
