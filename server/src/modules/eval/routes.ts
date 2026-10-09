import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AgentEvalCase,
  AgentEvalCaseDetail,
  CreateEvalCaseResponse,
  EvalAgentDashboard,
  EvalCaseWrite,
  EvalFindingLink,
  EvalRunCompare,
  EvalSuiteRun,
  EvalSuiteRunDetail,
  EvalWorkspaceDashboard,
  RunAllEvalResponse,
  StartEvalRunBody,
  StartEvalRunResponse,
} from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { EvalRepository } from './repository.js';
import { EvalService } from './service.js';

/**
 * eval module (specs/eval-pipeline.md).
 *   POST   /findings/:id/eval-case      → freeze a case from a decided finding (201 / 200 existing / 422 …)
 *   GET    /pulls/:id/eval-case-links   → which findings of a PR already have a case
 *   GET    /agents/:id/eval-cases       → an agent's cases with their last result
 *   POST   /agents/:id/eval-cases       → write a case by hand (201; 422 expectation_not_grounded | diff_unavailable)
 *   GET    /eval-cases/:id · PUT /eval-cases/:id (same validation) · DELETE /eval-cases/:id
 *   POST   /agents/:id/eval-runs        → optional body {case_ids}; 202 {eval_run_id, status:'running'}; 409 eval_run_in_progress; 422 no_eval_cases | unknown_case
 *   GET    /agents/:id/eval-runs        → suite runs, newest first
 *   GET    /eval-runs/:id · GET /eval-runs/compare?a=&b=  (422 compare_different_agents)
 *   GET    /eval/dashboard · GET /agents/:id/eval-dashboard · POST /eval/run-all
 */

/** The body is optional (no body = every case): a missing body parses as `{}`. */
const OptionalRunBody = z.preprocess((v) => v ?? {}, StartEvalRunBody);
const CompareQuery = z.object({ a: z.string().uuid(), b: z.string().uuid() });
/** Tight per-route limit: every run is a batch of paid LLM calls. */
/** Writes that grow the paid surface (each case is one LLM call per run). */
const WRITE_RATE_LIMIT = { max: 60, timeWindow: '1 minute' } as const;
const PAID_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;
export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new EvalService({
    repo: new EvalRepository(container.db),
    parseDiff: parseUnifiedDiff,
    llm: (provider) => container.llm(provider),
    log: app.log,
  });

  // A run left `running` by a process that died would block its agent with 409 forever.
  // Best effort: a not-yet-migrated database must not stop the API from booting.
  try {
    const swept = await service.failOrphanedRuns();
    if (swept > 0) app.log.warn({ event: 'eval.orphaned_runs', swept }, 'marked orphaned eval runs as errored');
  } catch (err) {
    app.log.warn({ event: 'eval.orphan_sweep_failed', err: (err as Error).message }, 'could not sweep orphaned eval runs');
  }

  app.post(
    '/findings/:id/eval-case',
    { schema: { params: IdParams, response: { 200: CreateEvalCaseResponse, 201: CreateEvalCaseResponse } } },
    async (req, reply): Promise<CreateEvalCaseResponse> => {
      const { workspaceId } = await getContext(container, req);
      const result = await service.createFromFinding(workspaceId, req.params.id);
      reply.code(result.created ? 201 : 200);
      return result;
    },
  );

  app.get(
    '/pulls/:id/eval-case-links',
    { schema: { params: IdParams, response: { 200: z.array(EvalFindingLink) } } },
    async (req): Promise<EvalFindingLink[]> => {
      const { workspaceId } = await getContext(container, req);
      return service.linksForPull(workspaceId, req.params.id);
    },
  );

  app.get(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.array(AgentEvalCase) } } },
    async (req): Promise<AgentEvalCase[]> => {
      const { workspaceId } = await getContext(container, req);
      return service.listCases(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/eval-cases',
    {
      schema: { params: IdParams, body: EvalCaseWrite, response: { 201: CreateEvalCaseResponse } },
      config: { rateLimit: WRITE_RATE_LIMIT },
    },
    async (req, reply): Promise<CreateEvalCaseResponse> => {
      const { workspaceId } = await getContext(container, req);
      const created = await service.createManual(workspaceId, req.params.id, req.body);
      reply.code(201);
      return created;
    },
  );

  app.put(
    '/eval-cases/:id',
    {
      schema: { params: IdParams, body: EvalCaseWrite, response: { 200: AgentEvalCaseDetail } },
      config: { rateLimit: WRITE_RATE_LIMIT },
    },
    async (req): Promise<AgentEvalCaseDetail> => {
      const { workspaceId } = await getContext(container, req);
      return service.updateCase(workspaceId, req.params.id, req.body);
    },
  );

  app.get(
    '/eval-cases/:id',
    { schema: { params: IdParams, response: { 200: AgentEvalCaseDetail } } },
    async (req): Promise<AgentEvalCaseDetail> => {
      const { workspaceId } = await getContext(container, req);
      return service.getCase(workspaceId, req.params.id);
    },
  );

  app.delete(
    '/eval-cases/:id',
    { schema: { params: IdParams } },
    async (req, reply): Promise<void> => {
      const { workspaceId } = await getContext(container, req);
      await service.deleteCase(workspaceId, req.params.id);
      reply.code(204).send();
    },
  );

  app.post(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, body: OptionalRunBody, response: { 202: StartEvalRunResponse } }, config: { rateLimit: PAID_RATE_LIMIT } },
    async (req, reply): Promise<StartEvalRunResponse> => {
      const { workspaceId } = await getContext(container, req);
      const started = await service.startRun(workspaceId, req.params.id, {
        correlationId: req.id,
        caseIds: req.body.case_ids,
      });
      reply.code(202);
      return started;
    },
  );

  app.get(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, response: { 200: z.array(EvalSuiteRun) } } },
    async (req): Promise<EvalSuiteRun[]> => {
      const { workspaceId } = await getContext(container, req);
      return service.listRuns(workspaceId, req.params.id);
    },
  );

  app.get(
    '/eval-runs/compare',
    { schema: { querystring: CompareQuery, response: { 200: EvalRunCompare } } },
    async (req): Promise<EvalRunCompare> => {
      const { workspaceId } = await getContext(container, req);
      return service.compare(workspaceId, req.query.a, req.query.b);
    },
  );

  app.get(
    '/eval-runs/:id',
    { schema: { params: IdParams, response: { 200: EvalSuiteRunDetail } } },
    async (req): Promise<EvalSuiteRunDetail> => {
      const { workspaceId } = await getContext(container, req);
      return service.getRun(workspaceId, req.params.id);
    },
  );

  app.get(
    '/eval/dashboard',
    { schema: { response: { 200: EvalWorkspaceDashboard } } },
    async (req): Promise<EvalWorkspaceDashboard> => {
      const { workspaceId } = await getContext(container, req);
      return service.workspaceDashboard(workspaceId);
    },
  );

  app.get(
    '/agents/:id/eval-dashboard',
    { schema: { params: IdParams, response: { 200: EvalAgentDashboard } } },
    async (req): Promise<EvalAgentDashboard> => {
      const { workspaceId } = await getContext(container, req);
      return service.agentDashboard(workspaceId, req.params.id);
    },
  );

  app.post(
    '/eval/run-all',
    { schema: { response: { 200: RunAllEvalResponse } }, config: { rateLimit: PAID_RATE_LIMIT } },
    async (req): Promise<RunAllEvalResponse> => {
      const { workspaceId } = await getContext(container, req);
      return service.runAll(workspaceId, { correlationId: req.id });
    },
  );
}
