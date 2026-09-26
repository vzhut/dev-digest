// The only module that calls `fetch`. Typed methods over the DevDigest REST API, responses
// parsed with the package's own schemas, failures mapped to the Api*Error classes (api/errors.ts).
// Error messages are written for the model reading them: they name the next step, and never
// carry the API's `details` (which can echo request internals).
import { z } from 'zod';
import { sanitizeText } from '../format/sanitize.js';
import { ApiError, ApiNotFoundError, ApiRateLimitError, ApiUnreachableError } from './errors.js';
import {
  ActiveRun,
  Agent,
  ApiErrorBody,
  ConventionsResponse,
  PrMeta,
  PullDetail,
  Repo,
  ReviewRecord,
  ReviewRunResponse,
  RunSummary,
} from './schemas.js';

export interface RequestOptions {
  /** Aborts the request (the caller stopped waiting). */
  signal?: AbortSignal;
}

export interface ApiClient {
  listAgents(o?: RequestOptions): Promise<Agent[]>;
  listRepos(o?: RequestOptions): Promise<Repo[]>;
  /** Slow: the server syncs PRs from GitHub while answering. */
  listPulls(repoId: string, o?: RequestOptions): Promise<PrMeta[]>;
  /** Primes the PR's diff/files on the server (a review on a never-opened PR sees an empty diff). */
  getPull(prId: string, o?: RequestOptions): Promise<void>;
  activeRuns(prId: string, o?: RequestOptions): Promise<ActiveRun[]>;
  /** Newest first. */
  listRuns(prId: string, o?: RequestOptions): Promise<RunSummary[]>;
  /** Newest first. */
  listReviews(prId: string, o?: RequestOptions): Promise<ReviewRecord[]>;
  startReview(prId: string, agentId: string, o?: RequestOptions): Promise<ReviewRunResponse>;
  getConventions(repoId: string, o?: RequestOptions): Promise<ConventionsResponse>;
}

export interface ApiClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  /** Per-request timeout; `listPulls` gets double. Default 15 s. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const ERROR_MESSAGE_MAX = 300;

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const doFetch = opts.fetch ?? fetch;
  const baseUrl = opts.baseUrl.replace(/\/+$/, '');
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request<S extends z.ZodTypeAny>(
    method: 'GET' | 'POST',
    path: string,
    schema: S,
    o: { body?: unknown; timeoutMs?: number; signal?: AbortSignal | undefined } = {},
  ): Promise<z.infer<S>> {
    const timeout = AbortSignal.timeout(o.timeoutMs ?? timeoutMs);
    const signal = o.signal ? AbortSignal.any([timeout, o.signal]) : timeout;

    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, {
        method,
        signal,
        headers: o.body !== undefined ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
        ...(o.body !== undefined ? { body: JSON.stringify(o.body) } : {}),
      });
    } catch (err) {
      if (o.signal?.aborted) throw new ApiError('aborted', 'Request was cancelled.');
      if (isNamed(err, 'TimeoutError') || timeout.aborted) {
        throw new ApiError('timeout', `DevDigest API did not answer ${method} ${path} within ${Math.round((o.timeoutMs ?? timeoutMs) / 1000)} s. Retry, or check the API logs.`);
      }
      throw new ApiUnreachableError(baseUrl);
    }

    const text = await res.text().catch(() => '');
    if (!res.ok) throw await mapHttpError(res, text);

    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      throw unexpectedShape(method, path);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw unexpectedShape(method, path, parsed.error);
    return parsed.data;
  }

  const get = <S extends z.ZodTypeAny>(path: string, schema: S, o?: RequestOptions, timeout?: number) =>
    request('GET', path, schema, { signal: o?.signal, ...(timeout ? { timeoutMs: timeout } : {}) });
  const id = encodeURIComponent;

  return {
    listAgents: (o) => get('/agents', z.array(Agent), o),
    listRepos: (o) => get('/repos', z.array(Repo), o),
    listPulls: (repoId, o) => get(`/repos/${id(repoId)}/pulls`, z.array(PrMeta), o, timeoutMs * 2),
    getPull: async (prId, o) => {
      await get(`/pulls/${id(prId)}`, PullDetail, o);
    },
    activeRuns: (prId, o) => get(`/pulls/${id(prId)}/runs/active`, z.array(ActiveRun), o),
    listRuns: (prId, o) => get(`/pulls/${id(prId)}/runs`, z.array(RunSummary), o),
    listReviews: (prId, o) => get(`/pulls/${id(prId)}/reviews`, z.array(ReviewRecord), o),
    startReview: (prId, agentId, o) => request('POST', `/pulls/${id(prId)}/review`, ReviewRunResponse, { body: { agentId }, signal: o?.signal }),
    getConventions: (repoId, o) => get(`/repos/${id(repoId)}/conventions`, ConventionsResponse, o),
  };
}

function isNamed(err: unknown, name: string): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === name;
}

async function mapHttpError(res: Response, text: string): Promise<ApiError> {
  let message = `DevDigest API returned HTTP ${res.status}.`;
  let code = `http_${res.status}`;
  try {
    const body = ApiErrorBody.safeParse(JSON.parse(text));
    if (body.success) {
      code = body.data.error.code;
      // Only code + message are read; `details` is dropped on purpose.
      message = `DevDigest API error: ${sanitizeText(body.data.error.message, ERROR_MESSAGE_MAX)}`;
    }
  } catch {
    /* non-JSON error body: keep the generic message */
  }
  if (res.status === 404) return new ApiNotFoundError(message);
  if (res.status === 429) {
    const retry = Number(res.headers.get('retry-after'));
    return new ApiRateLimitError(Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : undefined);
  }
  return new ApiError(code, message);
}

function unexpectedShape(method: string, path: string, err?: z.ZodError): ApiError {
  // Issue paths only — never values.
  const where = err?.issues[0]?.path.join('.');
  return new ApiError(
    'unexpected_shape',
    `DevDigest API returned an unexpected shape for ${method} ${path}${where ? ` (at ${where})` : ''}. The API and devdigest-mcp may be out of sync: update mcp-server/src/api/schemas.ts.`,
  );
}
