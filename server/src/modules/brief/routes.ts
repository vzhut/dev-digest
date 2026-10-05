import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBriefResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BriefRepository } from './repository.js';
import { BriefService } from './service.js';

/**
 * brief module (specs/2026-10-02-pr-brief.md).
 *   GET  /pulls/:id/brief  → { status, stale, brief } (never calls the LLM)
 *   POST /pulls/:id/brief  → same shape (at most one paid LLM call; 409 no_changes | generation_in_progress, 502 brief_generation_failed)
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const blastService = container.prBlast(app.log);
  // Built once per plugin so the in-flight set is shared across requests.
  const service = new BriefService({
    repo: new BriefRepository(container.db, (prId, issues) =>
      app.log.warn({ event: 'brief.invalid_stored_brief', prId, issues }, 'brief: stored brief no longer parses'),
    ),
    intent: (ws, prId) => container.prIntent.get(ws, prId),
    linkedIssue: (ws, prId) => container.prIntent.firstLinkedIssue(ws, prId),
    blast: (ws, prId) => blastService.getBlast(ws, prId),
    docs: container.projectDocs,
    llm: (provider) => container.llm(provider),
    resolveModel: (ws, id) => container.resolveFeatureModel(ws, id),
    tokenizer: container.tokenizer,
    log: app.log,
  });

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBriefResponse } } },
    async (req): Promise<PrBriefResponse> => {
      const { workspaceId } = await getContext(container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  // Tight per-route limit: every call is a paid LLM request.
  app.post(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams, response: { 200: PrBriefResponse } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req): Promise<PrBriefResponse> => {
      const { workspaceId } = await getContext(container, req);
      return service.generate(workspaceId, req.params.id, { correlationId: req.id });
    },
  );
}
