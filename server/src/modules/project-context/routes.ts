import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AgentContext,
  ContextDocContent,
  ContextDocWritten,
  ContextListing,
  ContextPath,
  SetContextPathsBody,
  SetSearchRootsBody,
  MAX_CONTEXT_DOC_BYTES,
  SkillContext,
  WriteContextFileBody,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ProjectContextRepository } from './repository.js';
import { ProjectContextService } from './service.js';

const FileQuery = z.object({ path: ContextPath });
const RootsResponse = z.object({ roots: z.array(z.string()) });

/**
 * project-context module — repo docs (specs/docs/insights) that agents and skills attach to reviews.
 *   GET      /repos/:id/context          → ContextListing (fresh scan every request)
 *   GET      /repos/:id/context/file     → ContextDocContent (?path=, repo-relative .md)
 *   PUT      /repos/:id/context/file     → ContextDocWritten (replaces an existing doc in the LOCAL clone only)
 *   GET|PUT  /repos/:id/context/roots    → search globs ([] resets to the default)
 *   GET|PUT  /agents/:id/context         → AgentContext (own paths + inherited from skills)
 *   GET|PUT  /skills/:id/context         → SkillContext
 * Saves write only the jsonb column — never an agent/skill version.
 */
export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ProjectContextService({
    repo: new ProjectContextRepository(container.db),
    docs: container.projectDocs,
    tokenizer: container.tokenizer,
    now: () => new Date(),
    log: app.log,
  });

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: ContextListing } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.list(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/context/file',
    { schema: { params: IdParams, querystring: FileQuery, response: { 200: ContextDocContent } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.readFile(workspaceId, req.params.id, req.query.path);
    },
  );

  app.put(
    '/repos/:id/context/file',
    {
      // The app-wide 1 MiB body limit would answer 413 before the schema's 422; allow for
      // JSON escaping (up to 6x for control chars) so an oversize document is a validation error.
      bodyLimit: MAX_CONTEXT_DOC_BYTES * 6 + 4096,
      schema: { params: IdParams, body: WriteContextFileBody, response: { 200: ContextDocWritten } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.writeFile(workspaceId, req.params.id, req.body.path, req.body.content);
    },
  );

  app.get(
    '/repos/:id/context/roots',
    { schema: { params: IdParams, response: { 200: RootsResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getRoots(workspaceId, req.params.id);
    },
  );

  app.put(
    '/repos/:id/context/roots',
    { schema: { params: IdParams, body: SetSearchRootsBody, response: { 200: RootsResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.setRoots(workspaceId, req.params.id, req.body.roots);
    },
  );

  app.get(
    '/agents/:id/context',
    { schema: { params: IdParams, response: { 200: AgentContext } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getAgentContext(workspaceId, req.params.id);
    },
  );

  app.put(
    '/agents/:id/context',
    { schema: { params: IdParams, body: SetContextPathsBody, response: { 200: AgentContext } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.setAgentContext(workspaceId, req.params.id, req.body.paths);
    },
  );

  app.get(
    '/skills/:id/context',
    { schema: { params: IdParams, response: { 200: SkillContext } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getSkillContext(workspaceId, req.params.id);
    },
  );

  app.put(
    '/skills/:id/context',
    { schema: { params: IdParams, body: SetContextPathsBody, response: { 200: SkillContext } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.setSkillContext(workspaceId, req.params.id, req.body.paths);
    },
  );
}
