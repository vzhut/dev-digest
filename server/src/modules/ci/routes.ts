import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CiExportRequest,
  CiInstallation,
  CiInstallResult,
  CiPreview,
  CiSyncResult,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { CiRepository } from './repository.js';
import { CiIngestService } from './ingest.service.js';
import { CiExportService } from './service.js';
import { readRunnerBundle } from './runner-bundle.js';

/**
 * ci module — Export to CI (GitHub Actions).
 *   POST /agents/:id/ci/preview        → files + workflow violations + warnings
 *   POST /agents/:id/ci/install        → commit to devdigest/ci + open (or reuse) the PR
 *   POST /agents/:id/ci/zip            → the same bundle as a .zip download (no GitHub call)
 *   GET  /agents/:id/ci/installations  → where the agent is installed
 *   POST /ci/runs/sync                 → pull recent CI runs from GitHub, return the run list
 */

export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const c = app.container;
  const repo = new CiRepository(c.db);
  const service = new CiExportService({
    repo,
    agents: c.agentsRepo,
    github: () => c.github(),
    readRunnerBundle: () => readRunnerBundle(c.config.agentRunnerBundlePath),
    log: app.log,
  });

  const ingest = new CiIngestService({
    repo,
    github: () => c.github(),
    log: app.log,
  });

  app.post(
    '/ci/runs/sync',
    { schema: { response: { 200: CiSyncResult } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return ingest.sync(workspaceId);
    },
  );

  app.post(
    '/agents/:id/ci/preview',
    { schema: { params: IdParams, body: CiExportRequest, response: { 200: CiPreview } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.preview(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/agents/:id/ci/install',
    { schema: { params: IdParams, body: CiExportRequest, response: { 200: CiInstallResult } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.install(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/agents/:id/ci/zip',
    { schema: { params: IdParams, body: CiExportRequest } },
    async (req, reply) => {
      const { workspaceId } = await getContext(c, req);
      const { filename, bytes } = await service.zip(workspaceId, req.params.id, req.body);
      return reply
        .header('content-disposition', `attachment; filename="${filename}"`)
        .type('application/zip')
        .send(Buffer.from(bytes));
    },
  );

  app.get(
    '/agents/:id/ci/installations',
    { schema: { params: IdParams, response: { 200: z.array(CiInstallation) } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.listInstallations(workspaceId, req.params.id);
    },
  );
}
