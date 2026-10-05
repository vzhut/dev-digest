import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { OnboardingTourResponse, Tour } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { OnboardingRepository } from './repository.js';
import { OnboardingService } from './service.js';

const RepoIdParams = z.object({ repoId: z.string().uuid() });

/**
 * onboarding module (specs/2026-10-01-onboarding-tour.md).
 *   GET  /repos/:repoId/onboarding           → { status, tour?, index_sha } (never calls the LLM)
 *   POST /repos/:repoId/onboarding/generate  → Tour (at most one paid LLM call; 409 not_cloned | generation_in_progress)
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  // Built once per plugin so the in-flight set is shared across requests.
  const service = new OnboardingService({
    repo: new OnboardingRepository(container.db, (repoId, issues) =>
      app.log.warn({ event: 'onboarding.invalid_stored_tour', repoId, issues }, 'onboarding: stored tour no longer parses'),
    ),
    facts: (repoId) => container.repoIntel.collectTourFacts(repoId),
    classifyPaths: (repoId, sha, paths) => container.repoIntel.classifyPaths(repoId, sha, paths),
    indexSha: async (repoId) => (await container.repoIntel.getIndexState(repoId)).lastIndexedSha || null,
    cloneExists: (dir) => container.projectDocs.exists(dir),
    llm: (provider) => container.llm(provider),
    resolveModel: (workspaceId, id) => container.resolveFeatureModel(workspaceId, id),
    tokenizer: container.tokenizer,
    log: app.log,
  });

  app.get(
    '/repos/:repoId/onboarding',
    { schema: { params: RepoIdParams, response: { 200: OnboardingTourResponse } } },
    async (req): Promise<OnboardingTourResponse> => {
      const { workspaceId } = await getContext(container, req);
      return service.get(workspaceId, req.params.repoId);
    },
  );

  // Tight per-route limit: every call is a paid LLM request.
  app.post(
    '/repos/:repoId/onboarding/generate',
    {
      schema: { params: RepoIdParams, response: { 200: Tour } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req): Promise<Tour> => {
      const { workspaceId } = await getContext(container, req);
      return service.generate(workspaceId, req.params.repoId, { correlationId: req.id });
    },
  );
}
