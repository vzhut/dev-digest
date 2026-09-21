import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsService } from './service.js';
import { registerSkillImportRoutes } from './import-routes.js';

/**
 * Skills module.
 *   GET    /skills                                  → list (workspace-scoped)
 *   GET    /skills/:id                              → one skill
 *   POST   /skills                                  → create (manual, v1) — 409 on name clash
 *   PUT    /skills/:id                              → update (body change → new version) — 409 on name clash
 *   DELETE /skills/:id                              → delete (agent_skills cascade)
 *   GET    /skills/:id/versions                     → history, newest first
 *   GET    /skills/:id/stats                        → SkillStats (30d)
 *   POST   /skills/:id/versions/:version/restore    → old body as a new version
 *   POST   /skills/import/preview, /skills/import   → import-routes.ts
 */

const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

const CreateSkillBody = z.object({
  name: z.string().trim().min(1),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  enabled: z.boolean().optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().optional(),
  enabled: z.boolean().optional(),
  message: z.string().optional(),
});

const RestoreBody = z.object({ message: z.string().optional() }).nullish();

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  // Static `/skills/import*` routes are POST-only and Fastify's router prefers
  // static segments over `:id`, so ordering is not load-bearing; register first anyway.
  registerSkillImportRoutes(appBase, service);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: UpdateSkillBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.update(workspaceId, req.params.id, req.body);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.get('/skills/:id/stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const stats = await service.stats(workspaceId, req.params.id);
    if (!stats) throw new NotFoundError('Skill not found');
    return stats;
  });

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams, body: RestoreBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.restoreVersion(workspaceId, req.params.id, req.params.version, req.body?.message);
      if (!skill) throw new NotFoundError('Skill version not found');
      return skill;
    },
  );
}
