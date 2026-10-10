/* api.ts — typed fetch client for the F1 Fastify engine (localhost:3001).
   All hooks build on `apiFetch`. Errors are normalized to ApiError so the
   error-UX taxonomy (toast/inline/full-screen) can branch on status. */

import type {
  AgentEvalCase,
  AgentEvalCaseDetail,
  CreateEvalCaseResponse,
  EvalCaseWrite,
  EvalAgentDashboard,
  EvalFindingLink,
  EvalRunCompare,
  EvalSuiteRun,
  EvalSuiteRunDetail,
  EvalWorkspaceDashboard,
  OnboardingTourResponse,
  PrBrief,
  PrBriefResponse,
  RunAllEvalResponse,
  StartEvalRunResponse,
  Tour,
} from "@devdigest/shared";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Message to show for a failed request: the server's own message for an
    ApiError, otherwise the caller's localized fallback (network error, bug). */
export function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        // Only declare a JSON body when one is actually sent — otherwise a
        // body-less POST/PUT (e.g. tour generate, refresh, reindex) trips
        // Fastify's "Body cannot be empty when content-type is application/json".
        // A FormData body (skill import upload) must NOT get a JSON content-type: the browser
        // has to set `multipart/form-data; boundary=…` itself, otherwise the server reads
        // binary multipart bytes as JSON ("Request body size did not match Content-Length").
        ...(init?.body != null && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (e) {
    // network failure / API down → full-screen error candidate
    throw new ApiError(
      `Cannot reach the DevDigest engine at ${API_BASE}. Is the API running?`,
      0,
      "network_error",
      e
    );
  }

  if (!res.ok) {
    let code: string | undefined;
    let message = `${res.status} ${res.statusText}`;
    let details: unknown;
    try {
      const body = await res.json();
      if (body?.error) {
        code = body.error.code;
        message = body.error.message ?? message;
        details = body.error.details;
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status, code, details);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
  getOnboardingTour: (repoId: string) =>
    apiFetch<OnboardingTourResponse>(`/repos/${repoId}/onboarding`),
  /** One LLM call; resolves with the freshly stored tour (full or skeleton). */
  generateOnboardingTour: (repoId: string) =>
    apiFetch<Tour>(`/repos/${repoId}/onboarding/generate`, { method: "POST" }),

  getPrBrief: (prId: string) => apiFetch<PrBriefResponse>(`/pulls/${prId}/brief`),

  /** One LLM call. Answers with the stored brief (or the full read response). */
  generatePrBrief: (prId: string) =>
    apiFetch<PrBriefResponse | PrBrief>(`/pulls/${prId}/brief`, { method: "POST" }),

  // ---- eval pipeline (specs/eval-pipeline.md) ----
  /** One click, no body: 201 created / 200 already existed. */
  createEvalCase: (findingId: string) =>
    apiFetch<CreateEvalCaseResponse>(`/findings/${encodeURIComponent(findingId)}/eval-case`, { method: "POST" }),
  getEvalCaseLinks: (prId: string) => apiFetch<EvalFindingLink[]>(`/pulls/${encodeURIComponent(prId)}/eval-case-links`),
  listAgentEvalCases: (agentId: string) => apiFetch<AgentEvalCase[]>(`/agents/${encodeURIComponent(agentId)}/eval-cases`),
  getEvalCase: (caseId: string) => apiFetch<AgentEvalCaseDetail>(`/eval-cases/${encodeURIComponent(caseId)}`),
  deleteEvalCase: (caseId: string) => apiFetch<void>(`/eval-cases/${encodeURIComponent(caseId)}`, { method: "DELETE" }),
  /** A case written by hand in the editor (201). */
  createManualEvalCase: (agentId: string, body: EvalCaseWrite) =>
    apiFetch<CreateEvalCaseResponse>(`/agents/${encodeURIComponent(agentId)}/eval-cases`, { method: "POST", body: JSON.stringify(body) }),
  updateEvalCase: (caseId: string, body: EvalCaseWrite) =>
    apiFetch<AgentEvalCaseDetail>(`/eval-cases/${encodeURIComponent(caseId)}`, { method: "PUT", body: JSON.stringify(body) }),
  /** Paid: starts the agent's eval run in the background (202). Without `caseIds`: every case, and no body is sent. */
  startEvalRun: (agentId: string, caseIds?: string[]) =>
    apiFetch<StartEvalRunResponse>(`/agents/${encodeURIComponent(agentId)}/eval-runs`, {
      method: "POST",
      ...(caseIds ? { body: JSON.stringify({ case_ids: caseIds }) } : {}),
    }),
  listAgentEvalRuns: (agentId: string) => apiFetch<EvalSuiteRun[]>(`/agents/${encodeURIComponent(agentId)}/eval-runs`),
  getEvalRun: (runId: string) => apiFetch<EvalSuiteRunDetail>(`/eval-runs/${encodeURIComponent(runId)}`),
  compareEvalRuns: (a: string, b: string) =>
    apiFetch<EvalRunCompare>(`/eval-runs/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`),
  getEvalDashboard: () => apiFetch<EvalWorkspaceDashboard>("/eval/dashboard"),
  getAgentEvalDashboard: (agentId: string) =>
    apiFetch<EvalAgentDashboard>(`/agents/${encodeURIComponent(agentId)}/eval-dashboard`),
  /** Paid: one run per agent that has cases. */
  runAllEvals: () => apiFetch<RunAllEvalResponse>("/eval/run-all", { method: "POST" }),
};
