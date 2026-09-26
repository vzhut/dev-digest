import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrIntentRecord, PrIntentResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * intent module (specs/intent-layer.md, "API").
 *   GET  /pulls/:id/intent   → { intent: PrIntentRecord | null } (stale computed against the PR now)
 *   POST /pulls/:id/intent   → forced re-derive (one paid classifier call), returns the record
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.prIntent;

  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams, response: { 200: PrIntentResponse } } },
    async (req): Promise<PrIntentResponse> => {
      const { workspaceId } = await getContext(container, req);
      return { intent: await service.get(workspaceId, req.params.id) };
    },
  );

  // Tight per-route limit: every call is a paid LLM request.
  app.post(
    '/pulls/:id/intent',
    {
      schema: { params: IdParams, response: { 200: PrIntentRecord } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req): Promise<PrIntentRecord> => {
      const { workspaceId } = await getContext(container, req);
      return service.derive(workspaceId, req.params.id, { log: req.log, correlationId: req.id });
    },
  );
}
