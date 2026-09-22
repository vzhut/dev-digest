/**
 * Conventions Extractor module (§4.1 of specs/conventions-extractor.md).
 *
 *   POST  /repos/:id/conventions/extract        → run a scan; returns { scan, candidates }
 *   GET   /repos/:id/conventions                → latest scan + all its candidates
 *   PATCH /repos/:id/conventions/:cid            → accept / reject / edit
 *   POST  /repos/:id/conventions/skill-draft     → accepted candidates → draft (persists nothing)
 *   POST  /repos/:id/conventions/skill           → save the draft as an `extracted` skill
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionStatus, type ConventionsResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ConventionsService } from './service.js';

const CandidateParams = z.object({ id: z.string().uuid(), cid: z.string().uuid() });

const PatchCandidateBody = z
  .object({
    status: ConventionStatus.optional(),
    // Empty/whitespace-only → 422 at the schema layer (spec §4.1: "Empty rule → 422").
    rule: z.string().trim().min(1).optional(),
  })
  .strict();

const CreateSkillBody = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  body: z.string().optional(),
  enabled: z.boolean().optional(),
  agent_ids: z.array(z.string().uuid()).optional(),
});

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

  app.patch(
    '/repos/:id/conventions/:cid',
    { schema: { params: CandidateParams, body: PatchCandidateBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.patch(workspaceId, req.params.id, req.params.cid, req.body);
    },
  );

  app.post(
    '/repos/:id/conventions/skill-draft',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getSkillDraft(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateSkillBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const { agent_ids, ...rest } = req.body;
      const result = await service.createSkill(workspaceId, req.params.id, { ...rest, agentIds: agent_ids });
      reply.status(201);
      return { skill: result.skill, agent_ids_linked: result.agentIdsLinked };
    },
  );
}
