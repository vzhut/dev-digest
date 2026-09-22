/**
 * Conventions Extractor module (§4.1 of specs/conventions-extractor.md).
 *
 *   POST /repos/:id/conventions/extract   → run a scan; returns { scan, candidates }
 *   GET  /repos/:id/conventions           → latest scan + all its candidates
 *
 * PATCH /:cid, skill-draft and skill (slice 4) are not wired yet.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ConventionsResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ConventionsService } from './service.js';

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ConventionsService(container);

  app.get(
    '/repos/:id/conventions',
    { schema: { params: IdParams } },
    async (req): Promise<ConventionsResponse> => {
      const { workspaceId } = await getContext(container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams } },
    async (req): Promise<ConventionsResponse> => {
      const { workspaceId } = await getContext(container, req);
      return service.extract(workspaceId, req.params.id);
    },
  );
}
