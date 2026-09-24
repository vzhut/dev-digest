import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillImportPreview, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { AppError, ValidationError } from '../../platform/errors.js';
import { MAX_UPLOAD_BYTES, SkillImportError, parseSkillUpload } from './import.js';
import type { SkillsService } from './service.js';

const ImportBody = z.object({
  name: z.string().min(1),
  description: z.string(),
  type: SkillType,
  body: z.string().min(1),
  on_conflict: z.literal('update').optional(),
});

/**
 * POST /skills/import/preview — multipart `file` (.md | .zip); pure read.
 * POST /skills/import         — confirm: create (or update on name collision).
 */
export function registerSkillImportRoutes(appBase: FastifyInstance, service: SkillsService) {
  void appBase.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0, parts: 2 },
  });
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.post('/skills/import/preview', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const file = await req.file();
    if (!file) throw new ValidationError('Multipart field "file" is required');
    if (file.fieldname !== 'file') throw new ValidationError('Multipart field "file" is required');
    const data = await file.toBuffer(); // throws on limit (RequestFileTooLargeError, 413)
    if (file.file.truncated) throw new AppError('too_large', 'Upload is too large', 413);
    try {
      const parsed = parseSkillUpload(file.filename, new Uint8Array(data));
      const existing = await service.findByName(workspaceId, parsed.name);
      return SkillImportPreview.parse({ ...parsed, name_taken: existing !== undefined });
    } catch (err) {
      if (err instanceof SkillImportError) {
        throw new AppError(err.code, err.message, err.code === 'too_large' ? 413 : 422);
      }
      throw err;
    }
  });

  app.post('/skills/import', { schema: { body: ImportBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const { on_conflict, ...input } = req.body;
    const existing = await service.findByName(workspaceId, input.name);
    if (existing) {
      if (on_conflict !== 'update') {
        throw new AppError('name_taken', `A skill named "${input.name}" already exists`, 409);
      }
      return service.updateFromImport(workspaceId, existing.id, {
        description: input.description,
        type: input.type,
        body: input.body,
      });
    }
    reply.status(201);
    return service.createImported(workspaceId, input);
  });
}
